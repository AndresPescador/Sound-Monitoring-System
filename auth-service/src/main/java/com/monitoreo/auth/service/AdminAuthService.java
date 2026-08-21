package com.monitoreo.auth.service;

import com.monitoreo.auth.config.JwtConfig;
import com.monitoreo.auth.dto.*;
import com.monitoreo.auth.entity.AdminUser;
import com.monitoreo.auth.entity.AuthAuditLog;
import com.monitoreo.auth.entity.RegisteredStation;
import com.monitoreo.auth.exception.AdminNotFoundException;
import com.monitoreo.auth.exception.InvalidCredentialsException;
import com.monitoreo.auth.exception.StationNotFoundException;
import com.monitoreo.auth.exception.UsernameAlreadyExistsException;
import com.monitoreo.auth.repository.AdminUserRepository;
import com.monitoreo.auth.repository.ApiTokenRepository;
import com.monitoreo.auth.repository.AuthAuditLogRepository;
import com.monitoreo.auth.repository.RegisteredStationRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AdminAuthService {

    private static final Logger log = LoggerFactory.getLogger(AdminAuthService.class);

    private final AdminUserRepository adminUserRepository;
    private final RegisteredStationRepository stationRepository;
    private final ApiTokenRepository tokenRepository;
    private final AuthAuditLogRepository auditLogRepository;
    private final JwtConfig jwtConfig;
    private final PasswordEncoder passwordEncoder;

    // =========================================================================
    // AUTENTICACIÓN DE ADMINISTRADORES
    // =========================================================================

    @Transactional
    public AdminLoginResponse login(AdminLoginRequest request, String ipAddress) {
        AdminUser admin = adminUserRepository
                .findByUsernameAndActiveTrue(request.getUsername())
                .orElse(null);

        // Evaluación en tiempo constante — siempre ejecuta BCrypt aunque el
        // usuario no exista, para evitar timing attacks de enumeración de usuarios.
        boolean passwordOk = admin != null &&
                passwordEncoder.matches(request.getPassword(), admin.getPasswordHash());

        if (admin == null || !passwordOk) {
            auditLogRepository.save(buildAuditLog(
                    null, null, "ADMIN_LOGIN_FAILED", false,
                    "Intento fallido para username: " + request.getUsername(),
                    ipAddress
            ));
            log.warn("Login fallido para username: '{}' desde IP: {}",
                    request.getUsername(), ipAddress);
            throw new InvalidCredentialsException("Credenciales inválidas.");
        }

        String jti = UUID.randomUUID().toString();
        String token = jwtConfig.generateAdminToken(
                admin.getUsername(),
                admin.isSuperAdmin(),
                jti,
                admin.getCredentialsVersion()
        );

        admin.setLastLoginAt(OffsetDateTime.now());
        adminUserRepository.save(admin);

        auditLogRepository.save(buildAuditLog(
                null, admin, "ADMIN_LOGIN", true, "Login exitoso", ipAddress
        ));

        log.info("Login exitoso — admin: '{}', IP: {}", admin.getUsername(), ipAddress);

        return new AdminLoginResponse(
                token,
                jwtConfig.adminExpiresAt(),
                admin.getUsername(),
                admin.isSuperAdmin()
        );
    }

    @Transactional(readOnly = true)
    public AdminValidateResponse validateAdminToken(String token) {
        Claims claims;
        try {
            claims = jwtConfig.parseAdminToken(token);
        } catch (JwtException ex) {
            log.warn("Token admin inválido o expirado: {}", ex.getMessage());
            throw new InvalidCredentialsException("Token inválido o expirado.");
        }

        String username = claims.getSubject();
        if (username == null || username.isBlank()) {
            throw new InvalidCredentialsException("Token administrativo sin identidad.");
        }
        AdminUser admin = adminUserRepository
                .findByUsernameAndActiveTrue(username)
                .orElseThrow(() -> new InvalidCredentialsException(
                        "Administrador no encontrado o inactivo."));

        String role = validateSessionClaims(claims, admin);

        return new AdminValidateResponse(username, role, true);
    }

    @Transactional(readOnly = true)
    public AdminMeResponse getMe(String username) {
        AdminUser admin = adminUserRepository
                .findByUsernameAndActiveTrue(username)
                .orElseThrow(() -> new AdminNotFoundException(username));
        return new AdminMeResponse(admin.getUsername(), admin.isSuperAdmin(), admin.getLastLoginAt());
    }

    @Transactional
    public void changePassword(String username, AdminChangePasswordRequest request,
                                String ipAddress) {
        AdminUser admin = adminUserRepository
                .findByUsernameAndActiveTrue(username)
                .orElseThrow(() -> new AdminNotFoundException(username));

        if (!passwordEncoder.matches(request.getCurrentPassword(), admin.getPasswordHash())) {
            auditLogRepository.save(buildAuditLog(
                    null, admin, "ADMIN_PASSWORD_CHANGED", false,
                    "Password actual incorrecto", ipAddress
            ));
            throw new InvalidCredentialsException("El password actual es incorrecto.");
        }

        admin.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        admin.setCredentialsVersion(admin.getCredentialsVersion() + 1L);
        adminUserRepository.save(admin);

        auditLogRepository.save(buildAuditLog(
                null, admin, "ADMIN_PASSWORD_CHANGED", true,
                "Password cambiado exitosamente", ipAddress
        ));
        log.info("Password cambiado — admin: '{}'", username);
    }

    private String validateSessionClaims(Claims claims, AdminUser admin) {
        String expectedRole = admin.isSuperAdmin() ? "SUPER_ADMIN" : "ADMIN";
        String tokenRole = jwtConfig.extractRole(claims);
        Long tokenVersion = jwtConfig.extractCredentialsVersion(claims);

        if (!expectedRole.equals(tokenRole)
                || tokenVersion == null
                || tokenVersion.longValue() != admin.getCredentialsVersion()) {
            throw new InvalidCredentialsException("La sesión administrativa fue revocada.");
        }
        return tokenRole;
    }

    // =========================================================================
    // GESTIÓN DE ADMINISTRADORES (solo SUPER_ADMIN)
    // =========================================================================

    @Transactional
    public AdminUserResponse createAdmin(CreateAdminRequest request,
                                         String callerUsername, String ipAddress) {
        // CORRECCIÓN: usar UsernameAlreadyExistsException, no StationAlreadyExistsException
        if (adminUserRepository.existsByUsername(request.getUsername())) {
            throw new UsernameAlreadyExistsException(request.getUsername());
        }

        AdminUser newAdmin = new AdminUser();
        newAdmin.setUsername(request.getUsername());
        newAdmin.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        newAdmin.setSuperAdmin(false);
        adminUserRepository.save(newAdmin);

        AdminUser caller = adminUserRepository
                .findByUsernameAndActiveTrue(callerUsername)
                .orElseThrow(() -> new AdminNotFoundException(callerUsername));

        auditLogRepository.save(buildAuditLog(
                null, caller, "ADMIN_CREATED", true,
                "Admin creado: " + request.getUsername(), ipAddress
        ));

        log.info("Admin '{}' creado por super-admin '{}'",
                request.getUsername(), callerUsername);
        return new AdminUserResponse(newAdmin);
    }

    @Transactional(readOnly = true)
    public List<AdminUserResponse> listAdmins() {
        return adminUserRepository.findAll()
                .stream()
                .map(AdminUserResponse::new)
                .toList();
    }

    // =========================================================================
    // GESTIÓN DE ESTACIONES
    // =========================================================================

    @Transactional
    public RegisterStationResponse registerStation(RegisterStationRequest request,
                                                    String adminUsername, String ipAddress) {
        if (stationRepository.existsByStationCode(request.getStationCode())) {
            throw new com.monitoreo.auth.exception.StationAlreadyExistsException(
                    request.getStationCode());
        }

        String secret     = UUID.randomUUID().toString().replace("-", "");
        String secretHash = passwordEncoder.encode(secret);

        RegisteredStation station = new RegisteredStation();
        station.setStationCode(request.getStationCode());
        station.setName(request.getName());
        station.setDescription(request.getDescription());
        station.setLocality(request.getLocality());
        station.setSecretHash(secretHash);
        stationRepository.save(station);

        AdminUser admin = adminUserRepository
                .findByUsernameAndActiveTrue(adminUsername)
                .orElseThrow(() -> new AdminNotFoundException(adminUsername));

        auditLogRepository.save(buildAuditLog(
                station, admin, "STATION_CREATED", true,
                "Estación creada: " + request.getStationCode(), ipAddress
        ));

        log.info("Estación '{}' creada por admin '{}'",
                request.getStationCode(), adminUsername);

        // Constructor de Auth: (stationCode, name, locality, secret)
        return new RegisterStationResponse(
                station.getStationCode(),
                station.getName(),
                station.getLocality(),
                secret
        );
    }

    @Transactional
    public RotateSecretResponse rotateSecret(String stationCode,
                                              String adminUsername, String ipAddress) {
        RegisteredStation station = stationRepository
                .findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));

        String newSecret     = UUID.randomUUID().toString().replace("-", "");
        String newSecretHash = passwordEncoder.encode(newSecret);

        station.setSecretHash(newSecretHash);
        stationRepository.save(station);

        int revoked = tokenRepository.revokeAllActiveTokensForStation(
                station, OffsetDateTime.now(),
                "Secret rotado por administrador: " + adminUsername
        );

        AdminUser admin = adminUserRepository
                .findByUsernameAndActiveTrue(adminUsername)
                .orElseThrow(() -> new AdminNotFoundException(adminUsername));

        auditLogRepository.save(buildAuditLog(
                station, admin, "STATION_SECRET_ROTATED", true,
                "Secret rotado. Tokens revocados: " + revoked, ipAddress
        ));

        log.info("Secret rotado — estación: '{}', admin: '{}', tokens revocados: {}",
                stationCode, adminUsername, revoked);

        return new RotateSecretResponse(
                stationCode,
                newSecret,
                "Secret rotado. Tokens anteriores revocados: " + revoked +
                ". Configura este secret en la estación. No se volverá a mostrar."
        );
    }

    @Transactional
    public void revokeStationTokens(String stationCode,
                                     String adminUsername, String ipAddress) {
        RegisteredStation station = stationRepository
                .findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));

        int revoked = tokenRepository.revokeAllActiveTokensForStation(
                station, OffsetDateTime.now(),
                "Revocación manual por admin: " + adminUsername
        );

        AdminUser admin = adminUserRepository
                .findByUsernameAndActiveTrue(adminUsername)
                .orElseThrow(() -> new AdminNotFoundException(adminUsername));

        auditLogRepository.save(buildAuditLog(
                station, admin, "TOKEN_REVOKED", true,
                "Tokens revocados. Cantidad: " + revoked, ipAddress
        ));
    }

    @Transactional
    public void changeStationStatus(String stationCode, boolean active,
                                     String adminUsername, String ipAddress) {
        RegisteredStation station = stationRepository
                .findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));

        station.setActive(active);
        stationRepository.save(station);

        AdminUser admin = adminUserRepository
                .findByUsernameAndActiveTrue(adminUsername)
                .orElseThrow(() -> new AdminNotFoundException(adminUsername));

        auditLogRepository.save(buildAuditLog(
                station, admin, "STATION_STATUS_CHANGED", true,
                "Estado cambiado a: " + (active ? "ACTIVA" : "INACTIVA"), ipAddress
        ));

        log.info("Estación '{}' {} por admin '{}'",
                stationCode, active ? "activada" : "desactivada", adminUsername);
    }

    // =========================================================================
    // UTILIDADES PRIVADAS
    // =========================================================================

    private AuthAuditLog buildAuditLog(RegisteredStation station, AdminUser admin,
                                        String eventType, boolean success,
                                        String detail, String ipAddress) {
        AuthAuditLog entry = new AuthAuditLog();
        entry.setStation(station);
        entry.setAdminUser(admin);
        entry.setEventType(eventType);
        entry.setSuccess(success);
        entry.setDetail(detail);
        entry.setIpAddress(ipAddress);
        return entry;
    }
}
