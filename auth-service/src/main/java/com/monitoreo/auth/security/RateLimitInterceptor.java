package com.monitoreo.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Clock;
import java.time.Instant;
import java.util.Collections;

/**
 * Limitador compartido en Redis para los endpoints expuestos a fuerza bruta.
 * La operación INCR + EXPIRE es atómica y las claves caducan automáticamente.
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(RateLimitInterceptor.class);
    private static final int WINDOW_SECONDS = 60;
    private static final int KEY_TTL_SECONDS = 70;
    private static final DefaultRedisScript<Long> INCREMENT_SCRIPT =
            new DefaultRedisScript<>(
                    "local current = redis.call('INCR', KEYS[1]); " +
                    "if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; " +
                    "return current;",
                    Long.class
            );

    private final StringRedisTemplate redisTemplate;
    private final ClientIpResolver clientIpResolver;
    private final int authTokenLimit;
    private final int adminLoginLimit;
    private final Clock clock;

    @Autowired
    public RateLimitInterceptor(
            StringRedisTemplate redisTemplate,
            ClientIpResolver clientIpResolver,
            @Value("${ratelimit.auth-token-per-minute:30}") int authTokenLimit,
            @Value("${ratelimit.admin-login-per-minute:10}") int adminLoginLimit) {
        this(redisTemplate, clientIpResolver, authTokenLimit, adminLoginLimit, Clock.systemUTC());
    }

    RateLimitInterceptor(
            StringRedisTemplate redisTemplate,
            ClientIpResolver clientIpResolver,
            int authTokenLimit,
            int adminLoginLimit,
            Clock clock) {
        if (authTokenLimit <= 0 || adminLoginLimit <= 0) {
            throw new IllegalArgumentException("Los límites de autenticación deben ser positivos.");
        }
        this.redisTemplate = redisTemplate;
        this.clientIpResolver = clientIpResolver;
        this.authTokenLimit = authTokenLimit;
        this.adminLoginLimit = adminLoginLimit;
        this.clock = clock;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        if (!"POST".equals(request.getMethod())) {
            return true;
        }

        String path = request.getRequestURI();
        LimitConfiguration configuration = switch (path) {
            case "/auth/token" -> new LimitConfiguration("station-token", authTokenLimit);
            case "/admin/login" -> new LimitConfiguration("admin-login", adminLoginLimit);
            default -> null;
        };
        if (configuration == null) {
            return true;
        }

        long epochSecond = Instant.now(clock).getEpochSecond();
        long window = epochSecond / WINDOW_SECONDS;
        int resetSeconds = WINDOW_SECONDS - (int) (epochSecond % WINDOW_SECONDS);
        String clientIp = clientIpResolver.resolve(request);
        String key = "rate-limit:v1:" + configuration.bucket() + ":" + window + ":" + clientIp;

        final Long count;
        try {
            count = redisTemplate.execute(
                    INCREMENT_SCRIPT,
                    Collections.singletonList(key),
                    Integer.toString(KEY_TTL_SECONDS)
            );
        } catch (DataAccessException ex) {
            log.error("Redis no disponible para aplicar rate limiting: {}",
                    ex.getClass().getSimpleName());
            response.setHeader("Retry-After", "5");
            writeError(
                    response,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Servicio de control de acceso temporalmente no disponible."
            );
            return false;
        }

        if (count == null) {
            log.error("Redis devolvió una respuesta vacía al aplicar rate limiting");
            response.setHeader("Retry-After", "5");
            writeError(
                    response,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Servicio de control de acceso temporalmente no disponible."
            );
            return false;
        }

        long remaining = Math.max(0L, configuration.limit() - count);
        response.setHeader("RateLimit-Limit", Integer.toString(configuration.limit()));
        response.setHeader("RateLimit-Remaining", Long.toString(remaining));
        response.setHeader("RateLimit-Reset", Integer.toString(resetSeconds));

        if (count > configuration.limit()) {
            response.setHeader("Retry-After", Integer.toString(resetSeconds));
            writeError(
                    response,
                    HttpStatus.TOO_MANY_REQUESTS,
                    "Demasiadas solicitudes. Intente más tarde."
            );
            return false;
        }
        return true;
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String message)
            throws Exception {
        response.setStatus(status.value());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }

    private record LimitConfiguration(String bucket, int limit) {
    }
}
