package com.monitoreo.auth.service;

import com.monitoreo.auth.dto.ProcessingStationProvisionRequest;
import com.monitoreo.auth.dto.StationLifecycleOperationResponse;
import com.monitoreo.auth.entity.RegisteredStation;
import com.monitoreo.auth.entity.StationLifecycleOperation;
import com.monitoreo.auth.exception.StationOperationNotFoundException;
import com.monitoreo.auth.repository.RegisteredStationRepository;
import com.monitoreo.auth.repository.StationLifecycleOperationRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class StationLifecycleService {
    private static final Logger log = LoggerFactory.getLogger(StationLifecycleService.class);
    private static final List<String> OPEN_STATUSES = List.of("PENDING", "RETRYING", "FAILED");

    private final StationLifecycleOperationRepository operationRepository;
    private final RegisteredStationRepository stationRepository;
    private final WebClient webClient;

    @Value("${processing.station-lifecycle-url}")
    private String stationLifecycleUrl;

    @Value("${processing.metadata-sync-token}")
    private String syncToken;

    @Value("${station-sync.max-attempts}")
    private int maxAttempts;

    @Transactional
    public boolean syncNow(UUID operationId) {
        StationLifecycleOperation operation = operationRepository.findById(operationId)
                .orElseThrow(() -> new StationOperationNotFoundException(operationId));
        if ("COMPLETED".equals(operation.getStatus()) || "SUPERSEDED".equals(operation.getStatus())) {
            return true;
        }

        try {
            if ("PROVISION".equals(operation.getOperationType())) {
                provision(operation);
                RegisteredStation station = stationRepository.findByStationCode(operation.getStationCode())
                        .orElseThrow();
                if ("PROVISIONING".equals(station.getLifecycleStatus())) {
                    station.setLifecycleStatus("READY");
                    station.setActive(true);
                    stationRepository.save(station);
                }
            } else if ("DELETE".equals(operation.getOperationType())) {
                purge(operation);
                stationRepository.findByStationCode(operation.getStationCode())
                        .ifPresent(stationRepository::delete);
            } else {
                throw new IllegalStateException("Tipo de operación de estación desconocido.");
            }

            operation.setStatus("COMPLETED");
            operation.setLastError(null);
            operationRepository.save(operation);
            return true;
        } catch (WebClientResponseException ex) {
            boolean retryable = ex.getStatusCode().is5xxServerError();
            recordFailure(operation, retryable,
                    retryable ? "Processing no está disponible temporalmente."
                            : "Processing rechazó la operación con HTTP " + ex.getStatusCode().value() + ".");
            return false;
        } catch (Exception ex) {
            recordFailure(operation, true, "Processing no disponible o no respondió correctamente.");
            log.warn("Operación {} pendiente para estación {}: {}",
                    operation.getOperationType(), operation.getStationCode(), ex.getClass().getSimpleName());
            return false;
        }
    }

    private void provision(StationLifecycleOperation operation) {
        webClient.put()
                .uri(String.format(stationLifecycleUrl, operation.getStationCode()))
                .header("X-Station-Metadata-Sync", syncToken)
                .bodyValue(new ProcessingStationProvisionRequest(
                        operation.getName(), operation.getLocality(), operation.getDescription(),
                        operation.getAddress(), operation.getLatitude(), operation.getLongitude()))
                .retrieve()
                .toBodilessEntity()
                .block();
    }

    private void purge(StationLifecycleOperation operation) {
        webClient.delete()
                .uri(String.format(stationLifecycleUrl, operation.getStationCode()))
                .header("X-Station-Metadata-Sync", syncToken)
                .retrieve()
                .toBodilessEntity()
                .block();
    }

    private void recordFailure(StationLifecycleOperation operation, boolean retryable, String message) {
        int attempts = operation.getAttemptCount() + 1;
        operation.setAttemptCount(attempts);
        operation.setLastError(message);
        operation.setStatus(retryable && attempts < maxAttempts ? "RETRYING" : "FAILED");
        long seconds = Math.min(900, 30L * (1L << Math.min(attempts - 1, 5)));
        operation.setNextAttemptAt(OffsetDateTime.now().plusSeconds(seconds));
        operationRepository.save(operation);
    }

    @Scheduled(fixedDelayString = "${station-sync.retry-delay-ms}")
    @Transactional
    public void retryDueOperations() {
        operationRepository.findTop20ByStatusInAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
                        List.of("PENDING", "RETRYING"), OffsetDateTime.now())
                .forEach(operation -> syncNow(operation.getId()));
    }

    @Transactional
    public boolean retry(UUID operationId) {
        StationLifecycleOperation operation = operationRepository.findById(operationId)
                .orElseThrow(() -> new StationOperationNotFoundException(operationId));
        if (!OPEN_STATUSES.contains(operation.getStatus())) return true;
        operation.setStatus("PENDING");
        operation.setNextAttemptAt(OffsetDateTime.now());
        operationRepository.save(operation);
        return syncNow(operationId);
    }

    @Transactional
    public List<StationLifecycleOperationResponse> openOperations() {
        return operationRepository.findByStatusInOrderByUpdatedAtDesc(OPEN_STATUSES).stream()
                .map(operation -> StationLifecycleOperationResponse.from(operation, null))
                .toList();
    }

    @Transactional
    public StationLifecycleOperation get(UUID operationId) {
        return operationRepository.findById(operationId)
                .orElseThrow(() -> new StationOperationNotFoundException(operationId));
    }
}
