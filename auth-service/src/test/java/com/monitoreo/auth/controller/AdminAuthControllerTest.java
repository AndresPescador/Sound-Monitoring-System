package com.monitoreo.auth.controller;

import com.monitoreo.auth.dto.AdminChangePasswordRequest;
import com.monitoreo.auth.dto.AdminLoginRequest;
import com.monitoreo.auth.dto.CreateAdminRequest;
import com.monitoreo.auth.dto.RegisterStationRequest;
import com.monitoreo.auth.dto.RegisterStationResponse;
import com.monitoreo.auth.security.AdminTokenValidator;
import com.monitoreo.auth.service.AdminAuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminAuthControllerTest {

    private final AdminAuthService adminAuthService = mock(AdminAuthService.class);
    private final AdminTokenValidator tokenValidator = mock(AdminTokenValidator.class);
    private final AdminAuthController controller = new AdminAuthController(adminAuthService, tokenValidator);
    private final HttpServletRequest request = new MockHttpServletRequest();

    @Test
    void rejectsAdminValidationWithoutToken() {
        var response = controller.validateAdminToken(Map.of());
        assertEquals(400, response.getStatusCode().value());
    }

    @Test
    void delegatesStationRegistrationAfterAuthentication() {
        RegisterStationRequest body = new RegisterStationRequest();
        RegisterStationResponse expected = new RegisterStationResponse(
                "ST-CHAPINERO-01", "Estación ST-CHAPINERO-01", "Chapinero", "one-time-secret");
        when(tokenValidator.requireAdmin(request)).thenReturn("admin");
        when(tokenValidator.extractIp(request)).thenReturn("198.51.100.10");
        when(adminAuthService.registerStation(body, "admin", "198.51.100.10")).thenReturn(expected);

        var response = controller.registerStation(body, request);

        assertEquals(201, response.getStatusCode().value());
        assertEquals(expected, response.getBody());
        verify(tokenValidator).requireAdmin(request);
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
