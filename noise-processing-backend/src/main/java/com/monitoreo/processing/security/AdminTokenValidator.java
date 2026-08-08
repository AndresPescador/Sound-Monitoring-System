package com.monitoreo.processing.security;

import com.monitoreo.processing.exception.ForbiddenException;
import com.monitoreo.processing.exception.InvalidCredentialsException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

/**
 * Valida tokens de admin llamando al Auth Service internamente.
 *
 * Noise Processing no tiene acceso directo al JWT_SECRET ni a la BD de auth,
 * por lo que delega la validación al Auth Service via HTTP interno Docker.
 * Este es el mismo patrón que usa la Ingestion API para validar tokens de estación.
 *
 * Endpoint interno: POST http://nginx/auth/admin/validate
 * (bloqueado en VPS Nginx — solo accesible dentro de la red Docker)
 */
@Component
@RequiredArgsConstructor
public class AdminTokenValidator {

    private static final Logger log = LoggerFactory.getLogger(AdminTokenValidator.class);

    private final WebClient webClient;

    @Value("${auth.admin-validate-url}")
    private String adminValidateUrl;

    /**
     * Verifica que el request tenga un Bearer token válido con role ADMIN o SUPER_ADMIN.
     *
     * @return username del admin autenticado
     */
    public String requireAdmin(HttpServletRequest request) {
        return validateToken(request, false);
    }

    /**
     * Verifica que el request tenga un Bearer token válido con role SUPER_ADMIN.
     */
    public String requireSuperAdmin(HttpServletRequest request) {
        return validateToken(request, true);
    }

    /**
     * Extrae IP considerando el header X-Forwarded-For de Nginx.
     */
    public String extractIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    // ─── Privado ──────────────────────────────────────────────────────────────

    private String validateToken(HttpServletRequest request, boolean superAdminRequired) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new InvalidCredentialsException("Token de autenticación requerido.");
        }

        String token = authHeader.substring(7);

        Map<?, ?> response;
        try {
            response = webClient.post()
                    .uri(adminValidateUrl)
                    .bodyValue(Map.of("token", token))
                    .retrieve()
                    .onStatus(
                            status -> status.value() == HttpStatus.UNAUTHORIZED.value(),
                            clientResponse -> clientResponse.bodyToMono(String.class)
                                    .map(body -> new InvalidCredentialsException("Token de admin inválido o expirado."))
                    )
                    .onStatus(
                            status -> status.is5xxServerError(),
                            clientResponse -> clientResponse.bodyToMono(String.class)
                                    .map(body -> new RuntimeException("Auth Service no disponible."))
                    )
                    .bodyToMono(Map.class)
                    .block();
        } catch (InvalidCredentialsException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Error al validar token con Auth Service: {}", ex.getMessage());
            throw new RuntimeException("No se pudo validar el token. Intente nuevamente.");
        }

        if (response == null || !Boolean.TRUE.equals(response.get("valid"))) {
            throw new InvalidCredentialsException("Token de admin inválido.");
        }

        String role     = (String) response.get("role");
        String username = (String) response.get("username");

        if (superAdminRequired && !"SUPER_ADMIN".equals(role)) {
            throw new ForbiddenException("Esta operación requiere privilegios de super-administrador.");
        }

        return username;
    }
}
