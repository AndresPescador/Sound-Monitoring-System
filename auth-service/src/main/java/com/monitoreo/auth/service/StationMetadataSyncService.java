package com.monitoreo.auth.service;

import com.monitoreo.auth.dto.ProcessingMetadataSyncRequest;
import com.monitoreo.auth.dto.StationSyncStatusResponse;
import com.monitoreo.auth.entity.StationMetadataSync;
import com.monitoreo.auth.repository.StationMetadataSyncRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Entrega el outbox a Processing. Los reintentos son seguros por metadataVersion. */
@Service
@RequiredArgsConstructor
public class StationMetadataSyncService {
    private static final Logger log = LoggerFactory.getLogger(StationMetadataSyncService.class);
    private static final List<String> OPEN_STATUSES = List.of("PENDING", "RETRYING", "FAILED");

    private final StationMetadataSyncRepository syncRepository;
    private final WebClient webClient;

    @Value("${processing.metadata-sync-url}")
    private String metadataSyncUrl;

    @Value("${processing.metadata-sync-token}")
    private String metadataSyncToken;

    @Value("${station-sync.max-attempts}")
    private int maxAttempts;

    /** Intenta sincronizar de inmediato una operación recién confirmada. */
    @Transactional
    public boolean syncNow(UUID operationId) {
        StationMetadataSync operation = syncRepository.findById(operationId).orElseThrow();
        if ("COMPLETED".equals(operation.getStatus())) return true;
        if (!OPEN_STATUSES.contains(operation.getStatus())) return true;

        try {
            webClient.put()
                    .uri(String.format(metadataSyncUrl, operation.getStationCode()))
                    .header("X-Station-Metadata-Sync", metadataSyncToken)
                    .bodyValue(new ProcessingMetadataSyncRequest(
                            operation.getMetadataVersion(), operation.getName(), operation.getLocality(),
                            operation.getDescription(), operation.getAddress(),
                            operation.getLatitude(), operation.getLongitude()))
                    .retrieve()
                    .toBodilessEntity()
                    .block();
            operation.setStatus("COMPLETED");
            operation.setLastError(null);
            syncRepository.save(operation);
            return true;
        } catch (Exception ex) {
            int attempts = operation.getAttemptCount() + 1;
            operation.setAttemptCount(attempts);
            operation.setLastError("Processing no disponible o rechazó la sincronización.");
            operation.setStatus(attempts >= maxAttempts ? "FAILED" : "RETRYING");
            // Backoff acotado: 30s, 60s, 120s, ... hasta 15 minutos.
            long seconds = Math.min(900, 30L * (1L << Math.min(attempts - 1, 5)));
            operation.setNextAttemptAt(OffsetDateTime.now().plusSeconds(seconds));
            syncRepository.save(operation);
            log.warn("Sincronización pendiente para estación {} (intento {}): {}",
                    operation.getStationCode(), attempts, ex.getClass().getSimpleName());
            return false;
        }
    }

    @Scheduled(fixedDelayString = "${station-sync.retry-delay-ms}")
    public void retryDueOperations() {
        syncRepository.findTop20ByStatusInAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
                        List.of("PENDING", "RETRYING"), OffsetDateTime.now())
                .forEach(operation -> syncNow(operation.getId()));
    }

    @Transactional
    public boolean retryStation(String stationCode) {
        StationMetadataSync operation = syncRepository
                .findFirstByStationCodeAndStatusInOrderByMetadataVersionDesc(stationCode, OPEN_STATUSES)
                .orElseThrow(() -> new IllegalArgumentException("No hay una sincronización pendiente para esta estación."));
        operation.setStatus("PENDING");
        operation.setNextAttemptAt(OffsetDateTime.now());
        syncRepository.save(operation);
        return syncNow(operation.getId());
    }

    @Transactional
    public List<StationSyncStatusResponse> openStatuses() {
        return syncRepository.findByStatusInOrderByUpdatedAtDesc(OPEN_STATUSES).stream()
                .map(operation -> new StationSyncStatusResponse(operation.getStationCode(), operation.getStatus(),
                        operation.getAttemptCount(), operation.getLastError()))
                .toList();
    }
}
