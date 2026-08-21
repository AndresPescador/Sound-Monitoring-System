package com.monitoreo.auth.controller;

import com.monitoreo.auth.dto.*;
import com.monitoreo.auth.security.AdminTokenValidator;
import com.monitoreo.auth.service.AdminAuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Controller de administración con JWT y roles.
 *
 * Rutas bajo /auth/admin/* — mapeadas en Nginx Docker interno como:
 *   /admin/auth/* → auth-service /admin/*
 *
 * Protección por endpoint:
 *   - /login          → pública (no requiere token)
 *   - /validate       → pública en red interna Docker (llamada por Noise Processing)
 *   - /me             → requiere token ADMIN o SUPER_ADMIN
 *   - /change-password→ requiere token ADMIN o SUPER_ADMIN
 *   - /stations/*     → requiere token ADMIN o SUPER_ADMIN
 *   - /admins         → requiere token SUPER_ADMIN
 */
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminAuthController {

    private final AdminAuthService adminAuthService;
    private final AdminTokenValidator tokenValidator;

    // =========================================================================
    // AUTENTICACIÓN
    // =========================================================================

    /**
     * POST /admin/login  (expuesto en VPS Nginx con rate limiting)
     * Autentica un administrador y devuelve un JWT.
     */
    @PostMapping("/login")
    public ResponseEntity<AdminLoginResponse> login(
            @Valid @RequestBody AdminLoginRequest request,
            HttpServletRequest httpRequest
    ) {
        String ip = tokenValidator.extractIp(httpRequest);
        return ResponseEntity.ok(adminAuthService.login(request, ip));
    }

    /**
     * POST /admin/validate  (solo red interna Docker — bloqueado en VPS Nginx)
     * Valida un token de admin. Lo llama Noise Processing para proteger sus endpoints.
     */
    @PostMapping("/validate")
    public ResponseEntity<AdminValidateResponse> validateAdminToken(
            @RequestBody Map<String, String> body
    ) {
        String token = body.get("token");
        if (token == null || token.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(adminAuthService.validateAdminToken(token));
    }

    /**
     * GET /admin/me  (requiere token)
     * Devuelve el perfil del admin autenticado.
     */
    @GetMapping("/me")
    public ResponseEntity<AdminMeResponse> getMe(HttpServletRequest request) {
        String username = tokenValidator.requireAdmin(request);
        return ResponseEntity.ok(adminAuthService.getMe(username));
    }

    /**
     * POST /admin/change-password  (requiere token)
     * Cambia el password del admin autenticado. Requiere el password actual.
     */
    @PostMapping("/change-password")
    public ResponseEntity<Map<String, String>> changePassword(
            @Valid @RequestBody AdminChangePasswordRequest body,
            HttpServletRequest request
    ) {
        String username = tokenValidator.requireAdmin(request);
        String ip       = tokenValidator.extractIp(request);
        adminAuthService.changePassword(username, body, ip);
        return ResponseEntity.ok(Map.of(
                "message", "Password actualizado. Inicia sesión nuevamente."
        ));
    }

    // =========================================================================
    // GESTIÓN DE ADMINISTRADORES (solo SUPER_ADMIN)
    // =========================================================================

    /**
     * POST /admin/admins  (requiere SUPER_ADMIN)
     * Crea un nuevo administrador normal.
     */
    @PostMapping("/admins")
    public ResponseEntity<AdminUserResponse> createAdmin(
            @Valid @RequestBody CreateAdminRequest body,
            HttpServletRequest request
    ) {
        String callerUsername = tokenValidator.requireSuperAdmin(request);
        String ip             = tokenValidator.extractIp(request);
        AdminUserResponse response = adminAuthService.createAdmin(body, callerUsername, ip);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * GET /admin/admins  (requiere SUPER_ADMIN)
     * Lista todos los administradores.
     */
    @GetMapping("/admins")
    public ResponseEntity<List<AdminUserResponse>> listAdmins(HttpServletRequest request) {
        tokenValidator.requireSuperAdmin(request);
        return ResponseEntity.ok(adminAuthService.listAdmins());
    }

    // =========================================================================
    // GESTIÓN DE ESTACIONES (requiere ADMIN o SUPER_ADMIN)
    // =========================================================================

    /**
     * POST /admin/stations
     * Registra una nueva estación. Devuelve el secret UNA SOLA VEZ.
     */
    @PostMapping("/stations")
    public ResponseEntity<RegisterStationResponse> registerStation(
            @Valid @RequestBody RegisterStationRequest body,
            HttpServletRequest request
    ) {
        String username = tokenValidator.requireAdmin(request);
        String ip       = tokenValidator.extractIp(request);
        RegisterStationResponse response = adminAuthService.registerStation(body, username, ip);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * POST /admin/stations/{stationCode}/rotate-secret
     * Genera un nuevo secret e invalida todos los tokens activos.
     * El nuevo secret se devuelve UNA SOLA VEZ.
     */
    @PostMapping("/stations/{stationCode}/rotate-secret")
    public ResponseEntity<RotateSecretResponse> rotateSecret(
            @PathVariable String stationCode,
            HttpServletRequest request
    ) {
        String username = tokenValidator.requireAdmin(request);
        String ip       = tokenValidator.extractIp(request);
        return ResponseEntity.ok(adminAuthService.rotateSecret(stationCode, username, ip));
    }

    /**
     * DELETE /admin/stations/{stationCode}/token
     * Revoca todos los tokens activos sin cambiar el secret.
     * (conservado para compatibilidad con register_station.py si se adapta)
     */
    @DeleteMapping("/stations/{stationCode}/token")
    public ResponseEntity<Map<String, String>> revokeTokens(
            @PathVariable String stationCode,
            HttpServletRequest request
    ) {
        String username = tokenValidator.requireAdmin(request);
        String ip       = tokenValidator.extractIp(request);
        adminAuthService.revokeStationTokens(stationCode, username, ip);
        return ResponseEntity.ok(Map.of(
                "message", "Tokens revocados correctamente.",
                "stationCode", stationCode
        ));
    }

    /**
     * PATCH /admin/stations/{stationCode}/status
     * Activa o desactiva una estación.
     * Body: { "active": true/false }
     */
    @PatchMapping("/stations/{stationCode}/status")
    public ResponseEntity<Map<String, Object>> changeStatus(
            @PathVariable String stationCode,
            @RequestBody Map<String, Boolean> body,
            HttpServletRequest request
    ) {
        Boolean active = body.get("active");
        if (active == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "El campo 'active' es requerido."));
        }
        String username = tokenValidator.requireAdmin(request);
        String ip       = tokenValidator.extractIp(request);
        adminAuthService.changeStationStatus(stationCode, active, username, ip);
        return ResponseEntity.ok(Map.of(
                "message", "Estado actualizado.",
                "stationCode", stationCode,
                "active", active
        ));
    }
}
