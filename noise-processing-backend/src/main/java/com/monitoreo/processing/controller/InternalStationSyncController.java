package com.monitoreo.processing.controller;

import com.monitoreo.processing.dto.InternalStationMetadataSyncRequest;
import com.monitoreo.processing.exception.ForbiddenException;
import com.monitoreo.processing.service.StationAdminService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * No se enruta por Nginx: Auth lo consume mediante service_internal para
 * entregar el outbox. El token no concede acceso a ningún endpoint admin.
 */
@RestController
@RequestMapping("/internal/stations")
@RequiredArgsConstructor
public class InternalStationSyncController {
    private final StationAdminService stationAdminService;

    @Value("${processing.metadata-sync-token}")
    private String syncToken;

    @PutMapping("/{stationCode}/metadata")
    public ResponseEntity<Void> synchronizeMetadata(
            @PathVariable String stationCode,
            @RequestHeader(value = "X-Station-Metadata-Sync", required = false) String suppliedToken,
            @Valid @RequestBody InternalStationMetadataSyncRequest body) {
        if (!StringUtils.hasText(suppliedToken) || !MessageDigest.isEqual(
                syncToken.getBytes(StandardCharsets.UTF_8), suppliedToken.getBytes(StandardCharsets.UTF_8))) {
            throw new ForbiddenException("Credencial de sincronización inválida.");
        }
        stationAdminService.synchronizeMetadata(stationCode, body);
        return ResponseEntity.noContent().build();
    }
}
