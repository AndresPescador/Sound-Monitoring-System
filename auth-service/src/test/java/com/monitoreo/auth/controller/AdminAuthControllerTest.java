package com.monitoreo.auth.controller;

import com.monitoreo.auth.dto.AdminChangePasswordRequest;
import com.monitoreo.auth.dto.AdminLoginRequest;
import com.monitoreo.auth.dto.CreateAdminRequest;
import com.monitoreo.auth.dto.RegisterStationRequest;
import com.monitoreo.auth.dto.RegisterStationResponse;
import com.monitoreo.auth.entity.StationLifecycleOperation;
import com.monitoreo.auth.security.AdminTokenValidator;
import com.monitoreo.auth.service.AdminAuthService;
import com.monitoreo.auth.service.StationMetadataSyncService;
import com.monitoreo.auth.service.StationLifecycleService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminAuthControllerTest {

    private final AdminAuthService adminAuthService = mock(AdminAuthService.class);
    private final AdminTokenValidator tokenValidator = mock(AdminTokenValidator.class);
    private final StationMetadataSyncService metadataSyncService = mock(StationMetadataSyncService.class);
    private final StationLifecycleService lifecycleService = mock(StationLifecycleService.class);
    private final AdminAuthController controller = new AdminAuthController(
            adminAuthService, tokenValidator, metadataSyncService, lifecycleService);
    private final HttpServletRequest request = new MockHttpServletRequest();

    @Test
    void rejectsAdminValidationWithoutToken() {
        var response = controller.validateAdminToken(Map.of());
        assertEquals(400, response.getStatusCode().value());
    }

    @Test
    void delegatesStationRegistrationAfterAuthentication() {
        RegisterStationRequest body = new RegisterStationRequest();
        UUID operationId = UUID.randomUUID();
        RegisterStationResponse expected = new RegisterStationResponse(
                "ST-CHAPINERO-01", "Estación ST-CHAPINERO-01", "Chapinero", "one-time-secret",
                "PROVISIONING", operationId, "Pendiente");
        when(tokenValidator.requireAdmin(request)).thenReturn("admin");
        when(tokenValidator.extractIp(request)).thenReturn("198.51.100.10");
        when(adminAuthService.registerStation(body, "admin", "198.51.100.10")).thenReturn(expected);
        when(lifecycleService.syncNow(operationId)).thenReturn(true);

        var response = controller.registerStation(body, request);

        assertEquals(201, response.getStatusCode().value());
        assertEquals(expected, response.getBody());
        verify(tokenValidator).requireAdmin(request);
    }

    @Test
    void returnsAcceptedAndPreservesTheOneTimeSecretWhenProvisioningIsPending() {
        RegisterStationRequest body = new RegisterStationRequest();
        UUID operationId = UUID.randomUUID();
        RegisterStationResponse expected = new RegisterStationResponse(
                "ST-SUBA-01", "Estación Suba", "Suba", "one-time-secret",
                "PROVISIONING", operationId, "Pendiente");
        StationLifecycleOperation operation = new StationLifecycleOperation();
        operation.setId(operationId);
        operation.setStationCode("ST-SUBA-01");
        operation.setOperationType("PROVISION");
        operation.setStatus("RETRYING");
        when(tokenValidator.requireAdmin(request)).thenReturn("admin");
        when(tokenValidator.extractIp(request)).thenReturn("198.51.100.10");
        when(adminAuthService.registerStation(body, "admin", "198.51.100.10")).thenReturn(expected);
        when(lifecycleService.syncNow(operationId)).thenReturn(false);
        when(lifecycleService.get(operationId)).thenReturn(operation);

        var response = controller.registerStation(body, request);

        assertEquals(202, response.getStatusCode().value());
        assertEquals("one-time-secret", response.getBody().getSecret());
        assertEquals("PROVISIONING", response.getBody().getLifecycleStatus());
        assertEquals(operationId, response.getBody().getOperationId());
    }

    @Test
    void rejectsStatusChangeWithoutActiveField() {
        var response = controller.changeStatus("ST-TEST-01", Map.of(), request);
        assertEquals(400, response.getStatusCode().value());
    }

    @Test
    void delegatesPasswordChangeUsingAuthenticatedPrincipalAndIp() {
        AdminChangePasswordRequest body = new AdminChangePasswordRequest();
        when(tokenValidator.requireAdmin(request)).thenReturn("admin");
        when(tokenValidator.extractIp(request)).thenReturn("198.51.100.10");

        var response = controller.changePassword(body, request);

        assertEquals(200, response.getStatusCode().value());
        assertEquals("Password actualizado. Inicia sesión nuevamente.", response.getBody().get("message"));
        verify(adminAuthService).changePassword("admin", body, "198.51.100.10");
    }
}
