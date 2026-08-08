package com.monitoreo.auth.security;

import com.monitoreo.auth.config.JwtConfig;
import com.monitoreo.auth.exception.ForbiddenException;
import com.monitoreo.auth.exception.InvalidCredentialsException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Extrae y valida el JWT de admin del header Authorization.
 *
 * Los controllers llaman a requireAdmin() o requireSuperAdmin() al inicio
 * de cada método protegido. No se usa como filtro de servlet para mantener
 * la misma arquitectura que el resto del proyecto (sin Spring Security activo).
 *
 * Patrón de uso en controllers:
 *
 *   String username = adminTokenValidator.requireAdmin(request);
 *   // o
 *   String username = adminTokenValidator.requireSuperAdmin(request);
 */
@Component
@RequiredArgsConstructor
public class AdminTokenValidator {

    private final JwtConfig jwtConfig;

    /**
     * Verifica que el request tenga un Bearer token válido con role ADMIN o SUPER_ADMIN.
     *
     * @return username del admin autenticado
     * @throws InvalidCredentialsException si el token es inválido, expirado o ausente
     */
    public String requireAdmin(HttpServletRequest request) {
        return extractAndValidate(request, false);
    }

    /**
     * Verifica que el request tenga un Bearer token válido con role SUPER_ADMIN específicamente.
     *
     * @return username del super-admin autenticado
     * @throws ForbiddenException si el token es válido pero no es SUPER_ADMIN
     */
    public String requireSuperAdmin(HttpServletRequest request) {
        return extractAndValidate(request, true);
    }

    /**
     * Extrae el IP real del cliente, considerando el header X-Forwarded-For
     * que pone Nginx cuando actúa como proxy.
     */
    public String extractIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            // X-Forwarded-For puede ser una lista: "client, proxy1, proxy2"
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    // ─── Privado ──────────────────────────────────────────────────────────────

    private String extractAndValidate(HttpServletRequest request, boolean superAdminRequired) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new InvalidCredentialsException("Token de autenticación requerido.");
        }

        String token = authHeader.substring(7);
        Claims claims;
        try {
            claims = jwtConfig.parseToken(token);
        } catch (JwtException ex) {
            throw new InvalidCredentialsException("Token inválido o expirado.");
        }

        String role = jwtConfig.extractRole(claims);
        if (role == null) {
            // Token de estación — no es un admin
            throw new InvalidCredentialsException("El token no corresponde a un administrador.");
        }

        if (superAdminRequired && !"SUPER_ADMIN".equals(role)) {
            throw new ForbiddenException("Esta operación requiere privilegios de super-administrador.");
        }

        return claims.getSubject();
    }
}
