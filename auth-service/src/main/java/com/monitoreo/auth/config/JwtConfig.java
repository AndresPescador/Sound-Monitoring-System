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
import java.util.Arrays;
import java.util.Date;

/**
 * Gestión de JWT para estaciones y para administradores.
 *
 * Cada tipo de token usa una clave independiente y un claim token_type explícito.
 * Esto evita que una clave de estación comprometida permita fabricar sesiones
 * administrativas y permite rotar ambos dominios por separado.
 */
@Component
public class JwtConfig {

    private static final String ISSUER = "sound-monitoring-auth";
    private static final String ROLE_CLAIM = "role";
    private static final String TOKEN_TYPE_CLAIM = "token_type";
    private static final String CREDENTIALS_VERSION_CLAIM = "credentials_version";
    private static final String STATION_TOKEN_TYPE = "station";
    private static final String ADMIN_TOKEN_TYPE = "admin";
    private static final int MINIMUM_SECRET_BYTES = 32;

    private final SecretKey stationSecretKey;
    private final SecretKey adminSecretKey;
    private final long expirationDays;
    private final long adminExpirationHours;

    public JwtConfig(
            @Value("${jwt.station-secret}") String stationSecret,
            @Value("${jwt.admin-secret}") String adminSecret,
            @Value("${jwt.expiration-days:30}") long expirationDays,
            @Value("${jwt.admin-expiration-hours:8}") long adminExpirationHours
    ) {
        byte[] stationKeyBytes = secretBytes(stationSecret, "STATION_JWT_SECRET");
        byte[] adminKeyBytes = secretBytes(adminSecret, "ADMIN_JWT_SECRET");

        if (Arrays.equals(stationKeyBytes, adminKeyBytes)) {
            throw new IllegalArgumentException(
                    "STATION_JWT_SECRET y ADMIN_JWT_SECRET deben ser diferentes.");
        }
        if (expirationDays <= 0 || adminExpirationHours <= 0) {
            throw new IllegalArgumentException("Las expiraciones JWT deben ser mayores que cero.");
        }

        this.stationSecretKey     = Keys.hmacShaKeyFor(stationKeyBytes);
        this.adminSecretKey       = Keys.hmacShaKeyFor(adminKeyBytes);
        this.expirationDays       = expirationDays;
        this.adminExpirationHours = adminExpirationHours;
    }

    // ─── Tokens de estación (sin cambios respecto al original) ───────────────

    public String generateToken(String stationCode, String jti) {
        Date now    = new Date();
        Date expiry = new Date(now.getTime() + expirationDays * 86_400_000L);

        return Jwts.builder()
                .issuer(ISSUER)
                .subject(stationCode)
                .id(jti)
                .claim(TOKEN_TYPE_CLAIM, STATION_TOKEN_TYPE)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(stationSecretKey)
                .compact();
    }

    public OffsetDateTime expiresAt() {
        return OffsetDateTime.now(ZoneOffset.UTC).plusDays(expirationDays);
    }

    public Claims parseStationToken(String token) {
        return parseToken(token, stationSecretKey, STATION_TOKEN_TYPE);
    }

    // ─── Tokens de administrador ──────────────────────────────────────────────

    /**
     * Genera un JWT para un administrador humano.
     *
     * @param username    nombre de usuario del admin
     * @param isSuperAdmin si TRUE el claim role = "SUPER_ADMIN", si FALSE = "ADMIN"
     * @param jti identificador único del token
     * @param credentialsVersion versión de credenciales para revocar sesiones
     */
    public String generateAdminToken(String username, boolean isSuperAdmin, String jti,
                                     long credentialsVersion) {
        Date now    = new Date();
        Date expiry = new Date(now.getTime() + adminExpirationHours * 3_600_000L);
        String role = isSuperAdmin ? "SUPER_ADMIN" : "ADMIN";

        return Jwts.builder()
                .issuer(ISSUER)
                .subject(username)
                .id(jti)
                .claim(ROLE_CLAIM, role)
                .claim(TOKEN_TYPE_CLAIM, ADMIN_TOKEN_TYPE)
                .claim(CREDENTIALS_VERSION_CLAIM, credentialsVersion)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(adminSecretKey)
                .compact();
    }

    public OffsetDateTime adminExpiresAt() {
        return OffsetDateTime.now(ZoneOffset.UTC).plusHours(adminExpirationHours);
    }

    public Claims parseAdminToken(String token) {
        return parseToken(token, adminSecretKey, ADMIN_TOKEN_TYPE);
    }

    public String extractRole(Claims claims) {
        return claims.get(ROLE_CLAIM, String.class);
    }

    public Long extractCredentialsVersion(Claims claims) {
        Object value = claims.get(CREDENTIALS_VERSION_CLAIM);
        return value instanceof Number number ? number.longValue() : null;
    }

    private Claims parseToken(String token, SecretKey key, String expectedTokenType) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(ISSUER)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        String tokenType = claims.get(TOKEN_TYPE_CLAIM, String.class);
        if (!expectedTokenType.equals(tokenType)) {
            throw new io.jsonwebtoken.JwtException("Tipo de token incorrecto.");
        }
        return claims;
    }

    private static byte[] secretBytes(String secret, String variableName) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalArgumentException(variableName + " es obligatoria.");
        }
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < MINIMUM_SECRET_BYTES) {
            throw new IllegalArgumentException(
                    variableName + " debe contener al menos 32 bytes aleatorios.");
        }
        return bytes;
    }
}
