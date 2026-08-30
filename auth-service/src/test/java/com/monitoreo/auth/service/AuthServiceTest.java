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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock private RegisteredStationRepository stationRepository;
    @Mock private ApiTokenRepository tokenRepository;
    @Mock private JwtConfig jwtConfig;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private Claims claims;

    private AuthService service;
    private RegisteredStation station;

    @BeforeEach
    void setUp() {
        service = new AuthService(stationRepository, tokenRepository, jwtConfig, passwordEncoder);
        when(passwordEncoder.encode(anyString())).thenReturn("dummy-hash");
        service.initDummyHash();

        station = new RegisteredStation();
        station.setStationCode("ST-TEST-01");
        station.setActive(true);
        station.setSecretHash("stored-hash");
    }

    @Test
    void issuesTokenAndPersistsItsRevocationRecord() {
        TokenRequest request = new TokenRequest();
        request.setStationCode("ST-TEST-01");
        request.setSecret("station-secret");
        OffsetDateTime expiresAt = OffsetDateTime.parse("2026-09-01T12:00:00Z");

        when(stationRepository.findByStationCode("ST-TEST-01")).thenReturn(Optional.of(station));
        when(passwordEncoder.matches("station-secret", "stored-hash")).thenReturn(true);
        when(jwtConfig.generateToken(anyString(), anyString())).thenReturn("signed-token");
        when(jwtConfig.expiresAt()).thenReturn(expiresAt);

        TokenResponse response = service.issueToken(request);

        assertEquals("signed-token", response.getToken());
        ArgumentCaptor<ApiToken> tokenCaptor = ArgumentCaptor.forClass(ApiToken.class);
        verify(tokenRepository).save(tokenCaptor.capture());
        assertEquals(station, tokenCaptor.getValue().getStation());
        assertNotNull(tokenCaptor.getValue().getJti());
        assertEquals(expiresAt, tokenCaptor.getValue().getExpiresAt());
    }

    @Test
    void rejectsUnknownInactiveAndWrongSecretCredentials() {
        TokenRequest request = new TokenRequest();
        request.setStationCode("ST-UNKNOWN-01");
        request.setSecret("secret");
        when(stationRepository.findByStationCode("ST-UNKNOWN-01")).thenReturn(Optional.empty());
        assertThrows(TokenInvalidException.class, () -> service.issueToken(request));
        verify(passwordEncoder).matches("secret", "dummy-hash");

        station.setActive(false);
        request.setStationCode("ST-TEST-01");
        when(stationRepository.findByStationCode("ST-TEST-01")).thenReturn(Optional.of(station));
        assertThrows(TokenInvalidException.class, () -> service.issueToken(request));

        station.setActive(true);
        when(passwordEncoder.matches("secret", "stored-hash")).thenReturn(false);
        assertThrows(TokenInvalidException.class, () -> service.issueToken(request));
        verify(tokenRepository, never()).save(any(ApiToken.class));
    }

    @Test
    void validatesRecognizedActiveTokenOnly() {
        ValidateRequest request = new ValidateRequest();
        request.setToken("signed-token");
        ApiToken apiToken = new ApiToken();
        apiToken.setJti("jti-1");
        apiToken.setStation(station);

        when(jwtConfig.parseStationToken("signed-token")).thenReturn(claims);
        when(claims.getId()).thenReturn("jti-1");
        when(tokenRepository.findByJti("jti-1")).thenReturn(Optional.of(apiToken));

        ValidateResponse response = service.validateToken(request);
        assertEquals("ST-TEST-01", response.getStationCode());

        apiToken.setRevoked(true);
        assertThrows(TokenInvalidException.class, () -> service.validateToken(request));
        apiToken.setRevoked(false);
        station.setActive(false);
        assertThrows(TokenInvalidException.class, () -> service.validateToken(request));
    }

    @Test
    void rejectsMalformedJwtBeforeRepositoryLookup() {
        ValidateRequest request = new ValidateRequest();
        request.setToken("malformed");
        when(jwtConfig.parseStationToken("malformed")).thenThrow(new JwtException("invalid signature"));

        assertThrows(TokenInvalidException.class, () -> service.validateToken(request));
        verify(tokenRepository, never()).findByJti(anyString());
    }
}
