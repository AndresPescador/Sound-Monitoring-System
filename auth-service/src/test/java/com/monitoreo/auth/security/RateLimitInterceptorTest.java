package com.monitoreo.auth.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;

@ExtendWith(MockitoExtension.class)
class RateLimitInterceptorTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    private RateLimitInterceptor interceptor;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(Instant.parse("2026-08-20T12:00:30Z"), ZoneOffset.UTC);
        interceptor = new RateLimitInterceptor(
                redisTemplate,
                new ClientIpResolver("172.28.10.0/24"),
                2,
                1,
                clock
        );
    }

    @Test
    void allowsRequestsWithinLimitAndReturnsQuotaHeaders() throws Exception {
        doReturn(1L).when(redisTemplate).execute(
                any(RedisScript.class), anyList(), any(String.class));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertTrue(interceptor.preHandle(post("/auth/token"), response, new Object()));
        assertEquals("2", response.getHeader("RateLimit-Limit"));
        assertEquals("1", response.getHeader("RateLimit-Remaining"));
        assertEquals("30", response.getHeader("RateLimit-Reset"));
    }

    @Test
    void rejectsRequestsAboveLimit() throws Exception {
        doReturn(2L).when(redisTemplate).execute(
                any(RedisScript.class), anyList(), any(String.class));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(interceptor.preHandle(post("/admin/login"), response, new Object()));
        assertEquals(429, response.getStatus());
        assertEquals("30", response.getHeader("Retry-After"));
        assertEquals("no-store", response.getHeader("Cache-Control"));
    }

    @Test
    void failsClosedWhenRedisIsUnavailable() throws Exception {
        doThrow(new DataAccessResourceFailureException("unavailable"))
                .when(redisTemplate).execute(
                        any(RedisScript.class), anyList(), any(String.class));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(interceptor.preHandle(post("/auth/token"), response, new Object()));
        assertEquals(503, response.getStatus());
        assertEquals("5", response.getHeader("Retry-After"));
    }

    private MockHttpServletRequest post(String path) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setRemoteAddr("172.28.10.2");
        request.addHeader("X-Forwarded-For", "198.51.100.4");
        return request;
    }
}
