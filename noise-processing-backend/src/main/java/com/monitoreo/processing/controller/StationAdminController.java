package com.monitoreo.processing.controller;

import com.monitoreo.processing.dto.*;
import com.monitoreo.processing.security.AdminTokenValidator;
import com.monitoreo.processing.service.StationAdminService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * CRUD administrativo de estaciones en noise_analytics.
 *
 * Todos los endpoints requieren un JWT de admin válido.
 * La validación se delega al Auth Service via AdminTokenValidator.
 *
 * Rutas bajo /processing/admin/* — mapeadas en Nginx Docker interno como:
 *   /admin/processing/* → noise-processing /admin/*
 *
 * NOTA IMPORTANTE sobre la coherencia de datos:
 * Las estaciones viven en DOS bases de datos:
 *   - station_registry (Auth Service): credenciales y tokens
 *   - noise_analytics  (este servicio): metadatos geográficos y métricas
 *
 * Auth orquesta las altas y bajas a través del controlador interno. Las rutas
 * administrativas antiguas de creación y borrado se conservan como 410 Gone.
 */
@RestController
@RequestMapping("/admin/stations")
@RequiredArgsConstructor
public class StationAdminController {

    private final StationAdminService stationAdminService;
    private final AdminTokenValidator tokenValidator;

    /**
     * POST /admin/stations
     * Endpoint legado retirado. Auth es el único orquestador de altas.
     */
    @PostMapping
    public ResponseEntity<Map<String, String>> registerStation(
            HttpServletRequest httpRequest
    ) {
        tokenValidator.requireAdmin(httpRequest);
        return ResponseEntity.status(HttpStatus.GONE).body(Map.of(
                "error", "El registro de estaciones se realiza exclusivamente mediante Auth."
        ));
    }

    /**
     * GET /admin/stations
     * Lista todas las estaciones con datos completos (incluyendo inactivas).
     */
    @GetMapping
    public ResponseEntity<List<StationAdminResponse>> listStations(HttpServletRequest request) {
        tokenValidator.requireAdmin(request);
        return ResponseEntity.ok(stationAdminService.listStations());
    }

    /**
     * GET /admin/stations/{stationCode}
     * Detalle completo de una estación.
     */
    @GetMapping("/{stationCode}")
    public ResponseEntity<StationAdminResponse> getStation(
            @PathVariable String stationCode,
            HttpServletRequest request
    ) {
        tokenValidator.requireAdmin(request);
        return ResponseEntity.ok(stationAdminService.getStation(stationCode));
    }

    /**
     * PUT /admin/stations/{stationCode}
     * Endpoint legado. Las modificaciones coordinadas se realizan mediante
     * PUT /auth/admin/stations/{stationCode}; no debe ser usado por el panel.
     */
    @PutMapping("/{stationCode}")
    @Deprecated(forRemoval = false)
    public ResponseEntity<Map<String, String>> updateStation(
            @PathVariable String stationCode,
            @Valid @RequestBody UpdateStationRequest body,
            HttpServletRequest request
    ) {
        tokenValidator.requireAdmin(request);
        return ResponseEntity.status(HttpStatus.GONE).body(Map.of(
                "error", "Use PUT /auth/admin/stations/{stationCode} para actualizar datos coordinados."
        ));
    }

    /**
     * PATCH /admin/stations/{stationCode}/status
     * Activa o desactiva una estación en noise_analytics.
     * El frontend debe llamar también al Auth Service para sincronizar.
     * Body: { "active": true/false }
     */
    @PatchMapping("/{stationCode}/status")
    public ResponseEntity<StationAdminResponse> changeStatus(
            @PathVariable String stationCode,
            @RequestBody Map<String, Boolean> body,
            HttpServletRequest request
    ) {
        Boolean active = body.get("active");
        if (active == null) {
            return ResponseEntity.badRequest().build();
        }
        tokenValidator.requireAdmin(request);
        return ResponseEntity.ok(stationAdminService.changeStatus(stationCode, active));
    }

    /**
     * DELETE /admin/stations/{stationCode}
     * Elimina la estación y TODOS sus datos (mediciones y agregaciones).
     * Operación irreversible — el frontend debe pedir confirmación.
     */
    @DeleteMapping("/{stationCode}")
    public ResponseEntity<Map<String, String>> deleteStation(
            @PathVariable String stationCode,
            HttpServletRequest request
    ) {
        tokenValidator.requireAdmin(request);
        return ResponseEntity.status(HttpStatus.GONE).body(Map.of(
                "error", "La eliminación de estaciones se realiza exclusivamente mediante Auth."
        ));
    }
}
