package com.monitoreo.auth.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JwtConfigTest {

    private static final String STATION_SECRET =
            "station-secret-with-at-least-thirty-two-independent-bytes";
    private static final String ADMIN_SECRET =
            "admin-secret-with-at-least-thirty-two-different-random-bytes";

    @Test
    void stationAndAdminTokensUseIndependentTrustDomains() {
        JwtConfig jwtConfig = new JwtConfig(STATION_SECRET, ADMIN_SECRET, 30, 8);

        String stationToken = jwtConfig.generateToken("ST-TEST-01", "station-jti");
        String adminToken = jwtConfig.generateAdminToken(
                "security-admin", true, "admin-jti", 7L);

        Claims stationClaims = jwtConfig.parseStationToken(stationToken);
        Claims adminClaims = jwtConfig.parseAdminToken(adminToken);

        assertEquals("ST-TEST-01", stationClaims.getSubject());
        assertEquals("SUPER_ADMIN", jwtConfig.extractRole(adminClaims));
        assertEquals(7L, jwtConfig.extractCredentialsVersion(adminClaims));
        assertThrows(JwtException.class, () -> jwtConfig.parseAdminToken(stationToken));
        assertThrows(JwtException.class, () -> jwtConfig.parseStationToken(adminToken));
    }

    @Test
    void rejectsReusedOrWeakSecrets() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new JwtConfig(STATION_SECRET, STATION_SECRET, 30, 8)
        );
        assertThrows(
                IllegalArgumentException.class,
                () -> new JwtConfig("too-short", ADMIN_SECRET, 30, 8)
        );
    }
}
