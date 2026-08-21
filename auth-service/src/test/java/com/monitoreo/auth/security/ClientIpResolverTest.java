package com.monitoreo.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ClientIpResolverTest {

    private final ClientIpResolver resolver = new ClientIpResolver("172.28.10.0/24");

    @Test
    void ignoresForwardedHeaderFromUntrustedConnection() {
        MockHttpServletRequest request = request("203.0.113.9", "198.51.100.4");

        assertEquals("203.0.113.9", resolver.resolve(request));
    }

    @Test
    void acceptsSingleNumericAddressFromTrustedGateway() {
        MockHttpServletRequest request = request("172.28.10.3", "198.51.100.4");

        assertEquals("198.51.100.4", resolver.resolve(request));
    }

    @Test
    void rejectsForwardedAddressLists() {
        MockHttpServletRequest request = request(
                "172.28.10.3",
                "198.51.100.4, 203.0.113.8"
        );

        assertEquals("172.28.10.3", resolver.resolve(request));
    }

    @Test
    void rejectsHostnamesAndInvalidAddresses() {
        MockHttpServletRequest hostname = request("172.28.10.3", "attacker.example");
        MockHttpServletRequest invalidIp = request("172.28.10.3", "999.1.1.1");

        assertEquals("172.28.10.3", resolver.resolve(hostname));
        assertEquals("172.28.10.3", resolver.resolve(invalidIp));
    }

    private MockHttpServletRequest request(String remoteAddress, String forwardedAddress) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddress);
        request.addHeader("X-Forwarded-For", forwardedAddress);
        return request;
    }
}
