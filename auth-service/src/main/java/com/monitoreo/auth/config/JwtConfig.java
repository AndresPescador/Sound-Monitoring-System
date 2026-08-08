package com.monitoreo.auth.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Date;

/**
 * Gestión de JWT para estaciones Y para administradores.
 *
 * Tokens de estación:  claim "sub" = stationCode, sin claim "role"
 * Tokens de admin:     claim "sub" = username, claim "role" = ADMIN | SUPER_ADMIN
 *
 * Ambos tipos se firman con la misma clave (JWT_SECRET) pero se distinguen
 * por la presencia del claim "role". La validación siempre verifica la firma
 * criptográfica antes de leer cualquier claim.
 */
@Component
public class JwtConfig {

    private static final String ROLE_CLAIM = "role";

    private final SecretKey secretKey;
    private final long expirationDays;
    private final long adminExpirationHours;

    public JwtConfig(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration-days:30}") long expirationDays,
            @Value("${jwt.admin-expiration-hours:8}") long adminExpirationHours
    ) {
        this.secretKey            = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationDays       = expirationDays;
        this.adminExpirationHours = adminExpirationHours;
    }

    // ─── Tokens de estación (sin cambios respecto al original) ───────────────

    public String generateToken(String stationCode, String jti) {
        Date now    = new Date();
        Date expiry = new Date(now.getTime() + expirationDays * 86_400_000L);

        return Jwts.builder()
                .subject(stationCode)
                .id(jti)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(secretKey)
                .compact();
    }

    public OffsetDateTime expiresAt() {
        return OffsetDateTime.now(ZoneOffset.UTC).plusDays(expirationDays);
    }

    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    // ─── Tokens de administrador ──────────────────────────────────────────────

    /**
     * Genera un JWT para un administrador humano.
     *
     * @param username    nombre de usuario del admin
     * @param isSuperAdmin si TRUE el claim role = "SUPER_ADMIN", si FALSE = "ADMIN"
     * @param jti         identificador único del token (para revocación)
     */
    public String generateAdminToken(String username, boolean isSuperAdmin, String jti) {
        Date now    = new Date();
        Date expiry = new Date(now.getTime() + adminExpirationHours * 3_600_000L);
        String role = isSuperAdmin ? "SUPER_ADMIN" : "ADMIN";

        return Jwts.builder()
                .subject(username)
                .id(jti)
                .claim(ROLE_CLAIM, role)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(secretKey)
                .compact();
    }

    public OffsetDateTime adminExpiresAt() {
        return OffsetDateTime.now(ZoneOffset.UTC).plusHours(adminExpirationHours);
    }

    /**
     * Extrae el claim "role" de un token ya parseado.
     * Devuelve null si no existe (es un token de estación, no de admin).
     */
    public String extractRole(Claims claims) {
        return claims.get(ROLE_CLAIM, String.class);
    }
}
