package com.monitoreo.processing.controller;

import com.monitoreo.processing.dto.MeasurementRequest;
import com.monitoreo.processing.dto.RegisterStationRequest;
import com.monitoreo.processing.dto.RegisterStationResponse;
import com.monitoreo.processing.service.MeasurementService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class MeasurementController {

    private final MeasurementService measurementService;

    @Value("${admin.api-key}")
    private String adminApiKey;

    /**
     * POST /processing/measurements
     *
     * Endpoint principal. Recibe el JSON de métricas acústicas de la
     * Ingestion API, lo persiste en acoustic_measurements y dispara
     * el recálculo de la agregación horaria correspondiente.
     */
    @PostMapping("/processing/measurements")
    public ResponseEntity<Map<String, Object>> ingestMeasurement(
            @RequestBody MeasurementRequest request
    ) {
        MeasurementService.ProcessResult result = measurementService.process(request);

        if (result == MeasurementService.ProcessResult.DUPLICATE) {
            return ResponseEntity.ok(Map.of(
                    "status", "ok",
                    "result", "duplicate",
                    "message", "Fragmento ya procesado previamente, ignorado.",
                    "station_code", request.getStationCode(),
                    "recorded_at", request.getTimestamp().toString()
            ));
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "status", "ok",
                "result", "inserted",
                "message", "Métricas persistidas y agregación actualizada.",
                "station_code", request.getStationCode(),
                "recorded_at", request.getTimestamp().toString()
        ));
    }

    /**
     * POST /admin/stations
     *
     * Registra una estación en noise_analytics.
     * Debe llamarse después de POST /admin/stations en el Auth Service.
     * Requiere el header X-Admin-Key.
     */
    @PostMapping("/admin/stations")
    public ResponseEntity<?> registerStation(
            @RequestHeader("X-Admin-Key") String apiKey,
            @RequestBody RegisterStationRequest request
    ) {
        if (!adminApiKey.equals(apiKey)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "API key inválida."));
        }

        RegisterStationResponse response = measurementService.registerStation(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * GET /health
     *
     * Health check para el Load Balancer.
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "service", "noise-processing-backend",
                "timestamp", OffsetDateTime.now().toString()
        ));
    }
}
