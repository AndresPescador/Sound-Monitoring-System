package com.monitoreo.processing.security;

import com.monitoreo.processing.exception.InvalidCredentialsException;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.reactive.function.client.WebClient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

class AdminTokenValidatorTest {

    @Test
    void rejectsRequestsWithoutBearerTokenBeforeCallingAuthService() {
        AdminTokenValidator validator = new AdminTokenValidator(mock(WebClient.class));
        HttpServletRequest request = new MockHttpServletRequest();

        assertThrows(InvalidCredentialsException.class, () -> validator.requireAdmin(request));
    }

    @Test
    void extractsFirstForwardedAddressAndFallsBackToRemoteAddress() {
        AdminTokenValidator validator = new AdminTokenValidator(mock(WebClient.class));
        MockHttpServletRequest forwarded = new MockHttpServletRequest();
        forwarded.setRemoteAddr("172.28.0.2");
        forwarded.addHeader("X-Forwarded-For", "198.51.100.4, 203.0.113.9");
        assertEquals("198.51.100.4", validator.extractIp(forwarded));

        MockHttpServletRequest direct = new MockHttpServletRequest();
        direct.setRemoteAddr("198.51.100.20");
        assertEquals("198.51.100.20", validator.extractIp(direct));
    }
}
