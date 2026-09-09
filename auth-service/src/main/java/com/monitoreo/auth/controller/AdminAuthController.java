package com.monitoreo.auth.controller;

import com.monitoreo.auth.dto.*;
import com.monitoreo.auth.security.AdminTokenValidator;
import com.monitoreo.auth.service.AdminAuthService;
import com.monitoreo.auth.service.StationMetadataSyncService;
import com.monitoreo.auth.service.StationLifecycleService;
import com.monitoreo.auth.entity.StationMetadataSync;
import com.monitoreo.auth.entity.StationLifecycleOperation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

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
    private final StationMetadataSyncService metadataSyncService;
    private final StationLifecycleService lifecycleService;

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
     * Registra una estación. Auth asigna el código desde la localidad y
     * devuelve el secret UNA SOLA VEZ.
     */
    @PostMapping("/stations")
    public ResponseEntity<RegisterStationResponse> registerStation(
            @Valid @RequestBody RegisterStationRequest body,
            HttpServletRequest request
    ) {
        String username = tokenValidator.requireAdmin(request);
        String ip       = tokenValidator.extractIp(request);
        RegisterStationResponse response = adminAuthService.registerStation(body, username, ip);
        boolean completed = lifecycleService.syncNow(response.getOperationId());
        StationLifecycleOperation operation = lifecycleService.get(response.getOperationId());
        response.setLifecycleStatus(completed ? "READY" : "PROVISIONING");
        response.setMessage(completed ? "Estación creada y aprovisionada correctamente."
                : "FAILED".equals(operation.getStatus())
                    ? "Credenciales creadas; Processing rechazó el aprovisionamiento y requiere revisión."
                    : "Credenciales creadas; el aprovisionamiento continuará automáticamente.");
        return ResponseEntity.status(completed ? HttpStatus.CREATED : HttpStatus.ACCEPTED).body(response);
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

    /** Actualiza solamente el nombre público de una estación. */
    @PutMapping("/stations/{stationCode}/name")
    public ResponseEntity<Map<String, String>> updateStationName(
            @PathVariable String stationCode,
            @Valid @RequestBody UpdateStationNameRequest body,
            HttpServletRequest request
    ) {
        String username = tokenValidator.requireAdmin(request);
        String ip = tokenValidator.extractIp(request);
        adminAuthService.updateStationName(stationCode, body, username, ip);
        return ResponseEntity.ok(Map.of("message", "Nombre actualizado.", "stationCode", stationCode));
    }

    /** Actualización coordinada de identidad y ubicación hacia Processing. */
    @PutMapping("/stations/{stationCode}")
    public ResponseEntity<StationMetadataUpdateResponse> updateStationMetadata(
            @PathVariable String stationCode,
            @Valid @RequestBody UpdateStationMetadataRequest body,
            HttpServletRequest request
    ) {
        String username = tokenValidator.requireAdmin(request);
        StationMetadataSync operation = adminAuthService.updateStationMetadata(
                stationCode, body, username, tokenValidator.extractIp(request));
        boolean synchronizedNow = metadataSyncService.syncNow(operation.getId());
        String status = synchronizedNow ? "COMPLETED" : "PENDING";
        StationMetadataUpdateResponse response = new StationMetadataUpdateResponse(
                stationCode, operation.getMetadataVersion(), status,
                synchronizedNow ? "Cambios sincronizados correctamente."
                        : "Cambios guardados; la sincronización con Processing está pendiente.");
        return ResponseEntity.status(synchronizedNow ? HttpStatus.OK : HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping("/stations/sync-status")
    public ResponseEntity<List<StationSyncStatusResponse>> syncStatuses(HttpServletRequest request) {
        tokenValidator.requireAdmin(request);
        return ResponseEntity.ok(metadataSyncService.openStatuses());
    }

    @PostMapping("/stations/{stationCode}/sync/retry")
    public ResponseEntity<StationMetadataUpdateResponse> retryStationSync(
            @PathVariable String stationCode, HttpServletRequest request) {
        tokenValidator.requireAdmin(request);
        boolean synchronizedNow = metadataSyncService.retryStation(stationCode);
        return ResponseEntity.status(synchronizedNow ? HttpStatus.OK : HttpStatus.ACCEPTED)
                .body(new StationMetadataUpdateResponse(stationCode, 0,
                        synchronizedNow ? "COMPLETED" : "PENDING",
                        synchronizedNow ? "Sincronización completada." : "Sincronización reprogramada."));
    }

    @DeleteMapping("/stations/{stationCode}")
    public ResponseEntity<StationLifecycleOperationResponse> deleteStation(
            @PathVariable String stationCode, HttpServletRequest request) {
        String username = tokenValidator.requireAdmin(request);
        StationLifecycleOperation operation = adminAuthService.initiateStationDeletion(
                stationCode, username, tokenValidator.extractIp(request));
        boolean completed = lifecycleService.syncNow(operation.getId());
        operation = lifecycleService.get(operation.getId());
        String message = completed ? "Estación y datos analíticos eliminados correctamente."
                : "FAILED".equals(operation.getStatus())
                    ? "La estación quedó bloqueada; Processing rechazó la purga y requiere revisión."
                    : "La estación quedó bloqueada y la purga continuará automáticamente.";
        return ResponseEntity.status(completed ? HttpStatus.OK : HttpStatus.ACCEPTED)
                .body(StationLifecycleOperationResponse.from(operation, message));
    }

    @GetMapping("/station-operations")
    public ResponseEntity<List<StationLifecycleOperationResponse>> lifecycleOperations(
            @RequestParam(defaultValue = "true") boolean open,
            HttpServletRequest request) {
        tokenValidator.requireAdmin(request);
        if (!open) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(lifecycleService.openOperations());
    }

    @PostMapping("/station-operations/{operationId}/retry")
    public ResponseEntity<StationLifecycleOperationResponse> retryLifecycleOperation(
            @PathVariable UUID operationId, HttpServletRequest request) {
        tokenValidator.requireAdmin(request);
        boolean completed = lifecycleService.retry(operationId);
        StationLifecycleOperation operation = lifecycleService.get(operationId);
        String message = completed ? "Operación completada."
                : "FAILED".equals(operation.getStatus())
                    ? "Processing volvió a rechazar la operación; revisa el conflicto antes de reintentar."
                    : "Operación reprogramada.";
        return ResponseEntity.status(completed ? HttpStatus.OK : HttpStatus.ACCEPTED)
                .body(StationLifecycleOperationResponse.from(operation, message));
    }
}
