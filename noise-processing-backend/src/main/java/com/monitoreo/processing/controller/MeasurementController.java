package com.monitoreo.processing.controller;

import com.monitoreo.processing.dto.MeasurementRequest;
import com.monitoreo.processing.service.MeasurementService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class MeasurementController {

    private final MeasurementService measurementService;

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
