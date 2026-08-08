package com.monitoreo.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Limitador de tasa en memoria (ventana fija de 60s) para endpoints
 * sensibles a fuerza bruta:
 *   - POST /auth/token    → credenciales de estación (station_code + secret)
 *   - POST /admin/login   → credenciales de administrador
 *
 * La clave es IP + ruta, por lo que el límite aplica por cliente.
 * Uso: registrado en RateLimitConfig solo para esas dos rutas.
 * En un futuro con múltiples instancias, mover a Redis o un store compartido.
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private static final int WINDOW_SECONDS = 60;
    private static final int MAX_WINDOWS = 10_000;

    private final int authTokenLimit;
    private final int adminLoginLimit;
    private final Clock clock;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public RateLimitInterceptor(
            @Value("${ratelimit.auth-token-per-minute:20}") int authTokenLimit,
            @Value("${ratelimit.admin-login-per-minute:10}") int adminLoginLimit) {
        this.authTokenLimit = authTokenLimit;
        this.adminLoginLimit = adminLoginLimit;
        this.clock = Clock.systemUTC();
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String path = request.getRequestURI();
        int limit = switch (path) {
            case "/auth/token"   -> authTokenLimit;
            case "/admin/login"  -> adminLoginLimit;
            default              -> Integer.MAX_VALUE;
        };

        long window = Instant.now(clock).getEpochSecond() / WINDOW_SECONDS;
        String key = extractIp(request) + "|" + path;

        Window current = windows.compute(key, (k, existing) -> {
            if (existing == null || existing.window != window) {
                return new Window(window);
            }
            return existing;
        });

        if (current.count.incrementAndGet() > limit) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"error\":\"Demasiadas solicitudes. Intente más tarde.\"}");
            return false;
        }

        // Evitar crecimiento infinito: descarta ventanas de ciclos anteriores.
        if (windows.size() > MAX_WINDOWS) {
            windows.entrySet().removeIf(e -> e.getValue().window != window);
        }
        return true;
    }

    private String extractIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private static final class Window {
        final long window;
        final AtomicInteger count = new AtomicInteger(0);

        Window(long window) {
            this.window = window;
        }
    }
}
