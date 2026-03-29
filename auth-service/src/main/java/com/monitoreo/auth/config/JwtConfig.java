package com.monitoreo.auth.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Date;

@Component
public class JwtConfig {

    private final SecretKey signingKey;
    private final long expirationDays;

    public JwtConfig(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration-days}") long expirationDays
    ) {
        this.signingKey  = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationDays = expirationDays;
    }

    /**
     * Genera un JWT firmado para una estación.
     *
     * @param stationCode Identificador de la estación (claim "sub").
     * @param jti         ID único del token (claim "jti").
     * @return Token JWT compacto.
     */
    public String generateToken(String stationCode, String jti) {
        Date now    = new Date();
        Date expiry = new Date(now.getTime() + expirationDays * 24L * 60 * 60 * 1000);

        return Jwts.builder()
                .subject(stationCode)
                .id(jti)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(signingKey)
                .compact();
    }

    /**
     * Parsea y verifica firma + expiración de un JWT.
     *
     * @param token JWT a validar.
     * @return Claims del token si es válido.
     * @throws JwtException Si la firma es inválida o el token está expirado.
     */
    public Claims parseToken(String token) throws JwtException {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /** Calcula la fecha de expiración a partir de ahora. */
    public OffsetDateTime expiresAt() {
        return OffsetDateTime.now().plusDays(expirationDays);
    }
}
