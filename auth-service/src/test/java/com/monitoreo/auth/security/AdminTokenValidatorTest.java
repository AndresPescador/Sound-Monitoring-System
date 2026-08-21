package com.monitoreo.auth.security;

import com.monitoreo.auth.config.JwtConfig;
import com.monitoreo.auth.entity.AdminUser;
import com.monitoreo.auth.exception.InvalidCredentialsException;
import com.monitoreo.auth.repository.AdminUserRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminTokenValidatorTest {

    @Mock
    private JwtConfig jwtConfig;

    @Mock
    private AdminUserRepository adminUserRepository;

    @Mock
    private HttpServletRequest request;

    @Mock
    private Claims claims;

    private AdminTokenValidator validator;
    private AdminUser admin;

    @BeforeEach
    void setUp() {
        validator = new AdminTokenValidator(jwtConfig, adminUserRepository);
        admin = new AdminUser();
        admin.setUsername("security-admin");
        admin.setSuperAdmin(true);
        admin.setActive(true);
        admin.setCredentialsVersion(3L);

        when(request.getHeader("Authorization")).thenReturn("Bearer signed-token");
        when(jwtConfig.parseAdminToken("signed-token")).thenReturn(claims);
        when(claims.getSubject()).thenReturn("security-admin");
        when(adminUserRepository.findByUsernameAndActiveTrue("security-admin"))
                .thenReturn(Optional.of(admin));
        when(jwtConfig.extractRole(claims)).thenReturn("SUPER_ADMIN");
    }

    @Test
    void acceptsOnlyCurrentCredentialsVersion() {
        when(jwtConfig.extractCredentialsVersion(claims)).thenReturn(3L);

        assertEquals("security-admin", validator.requireSuperAdmin(request));
    }

    @Test
    void rejectsSessionIssuedBeforePasswordRotation() {
        when(jwtConfig.extractCredentialsVersion(claims)).thenReturn(2L);

        assertThrows(InvalidCredentialsException.class, () -> validator.requireAdmin(request));
    }
}
