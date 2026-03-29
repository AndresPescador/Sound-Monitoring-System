package com.monitoreo.auth.controller;

import com.monitoreo.auth.dto.RegisterStationRequest;
import com.monitoreo.auth.dto.RegisterStationResponse;
import com.monitoreo.auth.service.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;

    @Value("${admin.api-key}")
    private String adminApiKey;

    /**
     * POST /admin/stations
     *
     * Registra una nueva estación de monitoreo en el sistema.
     * Devuelve el secret en texto plano UNA SOLA VEZ.
     * Requiere el header X-Admin-Key.
     */
    @PostMapping("/stations")
    public ResponseEntity<?> registerStation(
            @RequestHeader("X-Admin-Key") String apiKey,
            @RequestBody RegisterStationRequest request
    ) {
        if (!adminApiKey.equals(apiKey)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "API key inválida."));
        }

        RegisterStationResponse response = adminService.registerStation(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * DELETE /admin/stations/{stationCode}/token
     *
     * Revoca todos los tokens activos de una estación.
     * Útil si la estación es comprometida o reemplazada.
     * Requiere el header X-Admin-Key.
     */
    @DeleteMapping("/stations/{stationCode}/token")
    public ResponseEntity<?> revokeToken(
            @RequestHeader("X-Admin-Key") String apiKey,
            @PathVariable String stationCode
    ) {
        if (!adminApiKey.equals(apiKey)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "API key inválida."));
        }

        adminService.revokeStationTokens(stationCode);
        return ResponseEntity.ok(Map.of(
                "message", "Tokens revocados correctamente.",
                "stationCode", stationCode
        ));
    }

    /**
     * DELETE /admin/stations/{stationCode}
     *
     * Desactiva una estación. Sus tokens serán rechazados
     * en la próxima validación aunque no estén expirados.
     * Requiere el header X-Admin-Key.
     */
    @DeleteMapping("/stations/{stationCode}")
    public ResponseEntity<?> deactivateStation(
            @RequestHeader("X-Admin-Key") String apiKey,
            @PathVariable String stationCode
    ) {
        if (!adminApiKey.equals(apiKey)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "API key inválida."));
        }

        adminService.deactivateStation(stationCode);
        return ResponseEntity.ok(Map.of(
                "message", "Estación desactivada correctamente.",
                "stationCode", stationCode
        ));
    }
}
