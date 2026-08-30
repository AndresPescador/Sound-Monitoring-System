package com.monitoreo.auth.exception;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void exposesStableHttpContractsForAuthenticationAndAuthorizationErrors() {
        var unauthorized = handler.handleInvalidCredentials(new InvalidCredentialsException("invalid"));
        var forbidden = handler.handleForbidden(new ForbiddenException("forbidden"));
        var invalidToken = handler.handleTokenInvalid(new TokenInvalidException("expired"));

        assertEquals(401, unauthorized.getStatusCode().value());
        assertEquals("invalid", unauthorized.getBody().get("error"));
        assertEquals(403, forbidden.getStatusCode().value());
        assertEquals(401, invalidToken.getStatusCode().value());
    }
}
