package com.monitoreo.auth.service;

import com.monitoreo.auth.config.JwtConfig;
import com.monitoreo.auth.dto.TokenRequest;
import com.monitoreo.auth.dto.TokenResponse;
import com.monitoreo.auth.dto.ValidateRequest;
import com.monitoreo.auth.dto.ValidateResponse;
import com.monitoreo.auth.entity.ApiToken;
import com.monitoreo.auth.entity.RegisteredStation;
import com.monitoreo.auth.exception.TokenInvalidException;
import com.monitoreo.auth.repository.ApiTokenRepository;
import com.monitoreo.auth.repository.RegisteredStationRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final RegisteredStationRepository stationRepository;
    private final ApiTokenRepository tokenRepository;
    private final JwtConfig jwtConfig;
    private final PasswordEncoder passwordEncoder;

    /**
     * Hash BCrypt ficticio para igualar el tiempo de respuesta cuando la
     * estación no existe. Evita la enumeración de station_codes por timing.
     */
    private String dummyHash;

    @PostConstruct
    void initDummyHash() {
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /**
     * Emite un JWT para una estación que presenta su station_code + secret.
     *
     * Flujo:
     *   1. Buscar la estación por station_code.
     *   2. Verificar que esté activa.
     *   3. Comparar el secret recibido con el secret_hash almacenado (BCrypt).
     *   4. Generar un jti único y crear el JWT.
     *   5. Persistir el token en api_tokens para poder revocarlo después.
     *   6. Devolver el token.
     */
    @Transactional
    public TokenResponse issueToken(TokenRequest request) {
        RegisteredStation station = stationRepository
                .findByStationCode(request.getStationCode())
                .orElse(null);

        if (station == null) {
            // Mismo código HTTP (401) y tiempo de ejecución que un secret inválido,
            // para no revelar si un station_code existe o no.
            log.warn("Estación no registrada, secret evaluado contra hash dummy: {}",
                    request.getStationCode());
            passwordEncoder.matches(request.getSecret(), dummyHash);
            throw new TokenInvalidException("Credenciales inválidas.");
        }

        if (!station.isActive()) {
            log.warn("Intento de autenticación de estación inactiva: {}", request.getStationCode());
            throw new TokenInvalidException("La estación está inactiva.");
        }

        boolean secretMatches = passwordEncoder.matches(request.getSecret(), station.getSecretHash());
        if (!secretMatches) {
            log.warn("Secret incorrecto para estación: {}", request.getStationCode());
            throw new TokenInvalidException("Credenciales inválidas.");
        }

        String jti   = UUID.randomUUID().toString();
        String token = jwtConfig.generateToken(station.getStationCode(), jti);

        ApiToken apiToken = new ApiToken();
        apiToken.setStation(station);
        apiToken.setJti(jti);
        apiToken.setExpiresAt(jwtConfig.expiresAt());
        tokenRepository.save(apiToken);

        log.info("Token emitido para estación: {}, jti: {}", station.getStationCode(), jti);
        return new TokenResponse(token);
    }

    /**
     * Valida un JWT enviado por la Ingestion API.
     *
     * Flujo:
     *   1. Parsear y verificar la firma del JWT.
     *   2. Extraer el jti del token.
     *   3. Buscar el jti en api_tokens.
     *   4. Verificar que no esté revocado ni expirado.
     *   5. Verificar que la estación asociada esté activa.
     *   6. Devolver el station_code.
     */
    @Transactional(readOnly = true)
    public ValidateResponse validateToken(ValidateRequest request) {
        Claims claims;
        try {
            claims = jwtConfig.parseStationToken(request.getToken());
        } catch (JwtException ex) {
            log.warn("Token con firma inválida o expirado: {}", ex.getMessage());
            throw new TokenInvalidException("Token inválido o expirado.");
        }

        String jti = claims.getId();
        ApiToken apiToken = tokenRepository.findByJti(jti)
                .orElseThrow(() -> new TokenInvalidException("Token no reconocido."));

        if (apiToken.isRevoked()) {
            log.warn("Token revocado presentado, jti: {}", jti);
            throw new TokenInvalidException("Token revocado.");
        }

        RegisteredStation station = apiToken.getStation();
        if (!station.isActive()) {
            log.warn("Token válido pero estación inactiva: {}", station.getStationCode());
            throw new TokenInvalidException("La estación está inactiva.");
        }

        log.debug("Token válido para estación: {}", station.getStationCode());
        return new ValidateResponse(station.getStationCode());
    }
}
