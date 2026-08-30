package com.monitoreo.auth.controller;

import com.monitoreo.auth.dto.TokenRequest;
import com.monitoreo.auth.dto.TokenResponse;
import com.monitoreo.auth.dto.ValidateRequest;
import com.monitoreo.auth.dto.ValidateResponse;
import com.monitoreo.auth.service.AuthService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthControllerTest {

    private final AuthService authService = mock(AuthService.class);
    private final AuthController controller = new AuthController(authService);

    @Test
    void delegatesTokenAndValidationEndpoints() {
        TokenRequest tokenRequest = new TokenRequest();
        ValidateRequest validateRequest = new ValidateRequest();
        when(authService.issueToken(tokenRequest)).thenReturn(new TokenResponse("token"));
        when(authService.validateToken(validateRequest)).thenReturn(new ValidateResponse("ST-TEST-01"));

        assertEquals("token", controller.requestToken(tokenRequest).getBody().getToken());
        assertEquals("ST-TEST-01", controller.validateToken(validateRequest).getBody().getStationCode());
        assertEquals("auth-service", controller.health().getBody().get("service"));
    }
}
