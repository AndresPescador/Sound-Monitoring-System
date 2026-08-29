package com.monitoreo.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.monitoreo.auth.config.JwtConfig;
import com.monitoreo.auth.dto.RegisterStationRequest;
import com.monitoreo.auth.dto.RegisterStationResponse;
import com.monitoreo.auth.entity.AdminUser;
import com.monitoreo.auth.entity.RegisteredStation;
import com.monitoreo.auth.repository.AdminUserRepository;
import com.monitoreo.auth.repository.ApiTokenRepository;
import com.monitoreo.auth.repository.AuthAuditLogRepository;
import com.monitoreo.auth.repository.RegisteredStationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminAuthServiceTest {

    @Mock private AdminUserRepository adminUserRepository;
    @Mock private RegisteredStationRepository stationRepository;
    @Mock private ApiTokenRepository tokenRepository;
    @Mock private AuthAuditLogRepository auditLogRepository;
    @Mock private JwtConfig jwtConfig;
    @Mock private PasswordEncoder passwordEncoder;

    @InjectMocks private AdminAuthService service;

    @Test
    void registerStationGeneratesImmutableStandardNameAndIgnoresLegacyName() throws Exception {
        RegisterStationRequest request = new ObjectMapper().readValue("""
                {
                  "stationCode": "ST-CHAPINERO-01",
                  "name": "Nombre controlado por el cliente",
                  "locality": "Chapinero"
                }
                """, RegisterStationRequest.class);
        AdminUser admin = new AdminUser();
        admin.setUsername("admin");

        when(stationRepository.existsByStationCode("ST-CHAPINERO-01")).thenReturn(false);
        when(passwordEncoder.encode(anyString())).thenReturn("secret-hash");
        when(adminUserRepository.findByUsernameAndActiveTrue("admin")).thenReturn(Optional.of(admin));

        RegisterStationResponse response = service.registerStation(request, "admin", "127.0.0.1");

        ArgumentCaptor<RegisteredStation> stationCaptor = ArgumentCaptor.forClass(RegisteredStation.class);
        verify(stationRepository).save(stationCaptor.capture());
        assertEquals("Estación ST-CHAPINERO-01", stationCaptor.getValue().getName());
        assertEquals("Estación ST-CHAPINERO-01", response.getName());
    }
}
