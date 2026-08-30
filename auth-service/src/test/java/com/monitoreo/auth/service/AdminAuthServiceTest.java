package com.monitoreo.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.monitoreo.auth.config.JwtConfig;
import com.monitoreo.auth.dto.RegisterStationRequest;
import com.monitoreo.auth.dto.RegisterStationResponse;
import com.monitoreo.auth.dto.AdminLoginResponse;
import com.monitoreo.auth.dto.AdminLoginRequest;
import com.monitoreo.auth.dto.AdminChangePasswordRequest;
import com.monitoreo.auth.entity.AdminUser;
import com.monitoreo.auth.entity.RegisteredStation;
import com.monitoreo.auth.repository.AdminUserRepository;
import com.monitoreo.auth.repository.ApiTokenRepository;
import com.monitoreo.auth.repository.AuthAuditLogRepository;
import com.monitoreo.auth.repository.RegisteredStationRepository;
import io.jsonwebtoken.Claims;
import com.monitoreo.auth.exception.InvalidCredentialsException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertThrows;

@ExtendWith(MockitoExtension.class)
class AdminAuthServiceTest {

    @Mock private AdminUserRepository adminUserRepository;
    @Mock private RegisteredStationRepository stationRepository;
    @Mock private ApiTokenRepository tokenRepository;
    @Mock private AuthAuditLogRepository auditLogRepository;
    @Mock private JwtConfig jwtConfig;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private StationCodeAllocator stationCodeAllocator;
    @Mock private Claims claims;

    @InjectMocks private AdminAuthService service;

    @Test
    void registerStationGeneratesCodeAndNameAndIgnoresLegacyClientValues() throws Exception {
        RegisterStationRequest request = new ObjectMapper().readValue("""
                {
                  "stationCode": "ST-CONTROLADO-POR-CLIENTE-99",
                  "name": "Nombre controlado por el cliente",
                  "locality": "  san cristobal  "
                }
                """, RegisterStationRequest.class);
        AdminUser admin = new AdminUser();
        admin.setUsername("admin");

        when(stationCodeAllocator.nextCode("SAN-CRISTOBAL")).thenReturn("ST-SAN-CRISTOBAL-04");
        when(passwordEncoder.encode(anyString())).thenReturn("secret-hash");
        when(adminUserRepository.findByUsernameAndActiveTrue("admin")).thenReturn(Optional.of(admin));

        RegisterStationResponse response = service.registerStation(request, "admin", "127.0.0.1");

        ArgumentCaptor<RegisteredStation> stationCaptor = ArgumentCaptor.forClass(RegisteredStation.class);
        verify(stationRepository).save(stationCaptor.capture());
        assertEquals("ST-SAN-CRISTOBAL-04", stationCaptor.getValue().getStationCode());
        assertEquals("Estación ST-SAN-CRISTOBAL-04", stationCaptor.getValue().getName());
        assertEquals("San Cristóbal", stationCaptor.getValue().getLocality());
        assertEquals("ST-SAN-CRISTOBAL-04", response.getStationCode());
        assertEquals("Estación ST-SAN-CRISTOBAL-04", response.getName());
        assertEquals("San Cristóbal", response.getLocality());
    }

    @Test
    void loginCreatesSessionAndAuditsSuccessfulAuthentication() {
        AdminUser admin = new AdminUser();
        admin.setUsername("admin");
        admin.setPasswordHash("password-hash");
        admin.setCredentialsVersion(4L);
        admin.setSuperAdmin(true);
        when(adminUserRepository.findByUsernameAndActiveTrue("admin")).thenReturn(Optional.of(admin));
        when(passwordEncoder.matches("correct-password", "password-hash")).thenReturn(true);
        when(jwtConfig.generateAdminToken(
                org.mockito.ArgumentMatchers.eq("admin"),
                org.mockito.ArgumentMatchers.eq(true),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq(4L)))
                .thenReturn("admin-token");
        OffsetDateTime expiresAt = OffsetDateTime.parse("2026-08-30T20:00:00Z");
        when(jwtConfig.adminExpiresAt()).thenReturn(expiresAt);

        AdminLoginResponse response = service.login(
                new AdminLoginRequestBuilder().build("admin", "correct-password"),
                "198.51.100.10"
        );

        assertEquals("admin-token", response.getAccessToken());
        assertEquals("admin", response.getUsername());
        assertEquals(expiresAt, response.getExpiresAt());
        verify(adminUserRepository).save(admin);
        verify(auditLogRepository).save(org.mockito.ArgumentMatchers.any(com.monitoreo.auth.entity.AuthAuditLog.class));
    }

    @Test
    void loginUsesSameFailureContractForUnknownAndWrongPassword() {
        when(adminUserRepository.findByUsernameAndActiveTrue("missing")).thenReturn(Optional.empty());
        assertThrows(InvalidCredentialsException.class, () -> service.login(
                new AdminLoginRequestBuilder().build("missing", "password"), "127.0.0.1"));

        AdminUser admin = new AdminUser();
        admin.setUsername("admin");
        admin.setPasswordHash("password-hash");
        when(adminUserRepository.findByUsernameAndActiveTrue("admin")).thenReturn(Optional.of(admin));
        when(passwordEncoder.matches("wrong", "password-hash")).thenReturn(false);
        assertThrows(InvalidCredentialsException.class, () -> service.login(
                new AdminLoginRequestBuilder().build("admin", "wrong"), "127.0.0.1"));
    }

    @Test
    void validatesRoleAndCredentialsVersionInAdminSession() {
        AdminUser admin = new AdminUser();
        admin.setUsername("admin");
        admin.setCredentialsVersion(2L);
        admin.setSuperAdmin(false);
        when(jwtConfig.parseAdminToken("token")).thenReturn(claims);
        when(claims.getSubject()).thenReturn("admin");
        when(adminUserRepository.findByUsernameAndActiveTrue("admin")).thenReturn(Optional.of(admin));
        when(jwtConfig.extractRole(claims)).thenReturn("ADMIN");
        when(jwtConfig.extractCredentialsVersion(claims)).thenReturn(2L);

        assertEquals("admin", service.validateAdminToken("token").getUsername());

        when(jwtConfig.extractCredentialsVersion(claims)).thenReturn(1L);
        assertThrows(InvalidCredentialsException.class, () -> service.validateAdminToken("token"));
    }

    @Test
    void rotatesSecretAndRevokesExistingStationTokens() {
        RegisteredStation station = registeredStation();
        AdminUser admin = admin("admin");
        when(stationRepository.findByStationCode("ST-TEST-01")).thenReturn(Optional.of(station));
        when(passwordEncoder.encode(anyString())).thenReturn("rotated-hash");
        when(tokenRepository.revokeAllActiveTokensForStation(
                eq(station), any(OffsetDateTime.class), anyString())).thenReturn(3);
        when(adminUserRepository.findByUsernameAndActiveTrue("admin")).thenReturn(Optional.of(admin));

        var response = service.rotateSecret("ST-TEST-01", "admin", "198.51.100.10");

        assertEquals("ST-TEST-01", response.getStationCode());
        assertNotNull(response.getNewSecret());
        assertEquals("rotated-hash", station.getSecretHash());
        verify(stationRepository).save(station);
        verify(auditLogRepository).save(any(com.monitoreo.auth.entity.AuthAuditLog.class));
    }

    @Test
    void revokesTokensWithoutChangingStationSecret() {
        RegisteredStation station = registeredStation();
        AdminUser admin = admin("admin");
        when(stationRepository.findByStationCode("ST-TEST-01")).thenReturn(Optional.of(station));
        when(tokenRepository.revokeAllActiveTokensForStation(
                eq(station), any(OffsetDateTime.class), anyString())).thenReturn(2);
        when(adminUserRepository.findByUsernameAndActiveTrue("admin")).thenReturn(Optional.of(admin));

        service.revokeStationTokens("ST-TEST-01", "admin", "198.51.100.10");

        assertEquals("original-hash", station.getSecretHash());
        verify(auditLogRepository).save(any(com.monitoreo.auth.entity.AuthAuditLog.class));
    }

    @Test
    void changesPasswordAndIncrementsCredentialsVersion() throws Exception {
        AdminUser admin = admin("admin");
        admin.setPasswordHash("old-hash");
        admin.setCredentialsVersion(5L);
        when(adminUserRepository.findByUsernameAndActiveTrue("admin")).thenReturn(Optional.of(admin));
        when(passwordEncoder.matches("old-password", "old-hash")).thenReturn(true);
        when(passwordEncoder.encode("new-password-123")).thenReturn("new-hash");
        AdminChangePasswordRequest request = new ObjectMapper().readValue(
                "{\"currentPassword\":\"old-password\",\"newPassword\":\"new-password-123\"}",
                AdminChangePasswordRequest.class);

        service.changePassword("admin", request, "198.51.100.10");

        assertEquals("new-hash", admin.getPasswordHash());
        assertEquals(6L, admin.getCredentialsVersion());
        verify(adminUserRepository).save(admin);
        verify(auditLogRepository).save(any(com.monitoreo.auth.entity.AuthAuditLog.class));

        when(passwordEncoder.matches("wrong-password", "new-hash")).thenReturn(false);
        AdminChangePasswordRequest wrongRequest = new ObjectMapper().readValue(
                "{\"currentPassword\":\"wrong-password\",\"newPassword\":\"another-password-123\"}",
                AdminChangePasswordRequest.class);
        assertThrows(InvalidCredentialsException.class,
                () -> service.changePassword("admin", wrongRequest, "198.51.100.10"));
        assertEquals("new-hash", admin.getPasswordHash());
    }

    private RegisteredStation registeredStation() {
        RegisteredStation station = new RegisteredStation();
        station.setStationCode("ST-TEST-01");
        station.setSecretHash("original-hash");
        return station;
    }

    private AdminUser admin(String username) {
        AdminUser admin = new AdminUser();
        admin.setUsername(username);
        return admin;
    }

    private static final class AdminLoginRequestBuilder {
        AdminLoginRequest build(String username, String password) {
            try {
                var request = new ObjectMapper().readValue(
                        "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}",
                        AdminLoginRequest.class);
                return request;
            } catch (Exception ex) {
                throw new AssertionError(ex);
            }
        }
    }
}
