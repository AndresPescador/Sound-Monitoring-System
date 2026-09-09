package com.monitoreo.auth.service;

import com.monitoreo.auth.entity.RegisteredStation;
import com.monitoreo.auth.entity.StationLifecycleOperation;
import com.monitoreo.auth.repository.RegisteredStationRepository;
import com.monitoreo.auth.repository.StationLifecycleOperationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StationLifecycleServiceTest {
    @Mock private StationLifecycleOperationRepository operationRepository;
    @Mock private RegisteredStationRepository stationRepository;

    private StationLifecycleService service;

    @BeforeEach
    void setUp() {
        service = serviceReturning(HttpStatus.NO_CONTENT);
    }

    @Test
    void completesProvisioningAndEnablesStation() {
        StationLifecycleOperation operation = provisionOperation();
        RegisteredStation station = new RegisteredStation();
        station.setStationCode(operation.getStationCode());
        station.setLifecycleStatus("PROVISIONING");
        station.setActive(false);
        when(operationRepository.findById(operation.getId())).thenReturn(Optional.of(operation));
        when(stationRepository.findByStationCode(operation.getStationCode())).thenReturn(Optional.of(station));

        assertTrue(service.syncNow(operation.getId()));
        assertEquals("COMPLETED", operation.getStatus());
        assertEquals("READY", station.getLifecycleStatus());
        assertTrue(station.isActive());
        verify(stationRepository).save(station);
    }

    @Test
    void keepsRetryableFailureDurable() {
        service = serviceReturning(HttpStatus.SERVICE_UNAVAILABLE);
        StationLifecycleOperation operation = provisionOperation();
        when(operationRepository.findById(operation.getId())).thenReturn(Optional.of(operation));

        assertFalse(service.syncNow(operation.getId()));
        assertEquals("RETRYING", operation.getStatus());
        assertEquals(1, operation.getAttemptCount());
        verify(operationRepository).save(operation);
    }

    @Test
    void marksClientConflictAsFailedWithoutAutomaticRetry() {
        service = serviceReturning(HttpStatus.CONFLICT);
        StationLifecycleOperation operation = provisionOperation();
        when(operationRepository.findById(operation.getId())).thenReturn(Optional.of(operation));

        assertFalse(service.syncNow(operation.getId()));
        assertEquals("FAILED", operation.getStatus());
        assertEquals(1, operation.getAttemptCount());
    }

    @Test
    void completesDeletionAfterProcessingAcceptsAnAbsentOrPresentStation() {
        StationLifecycleOperation operation = new StationLifecycleOperation();
        operation.setId(UUID.randomUUID());
        operation.setStationCode("ST-SUBA-01");
        operation.setOperationType("DELETE");
        RegisteredStation station = new RegisteredStation();
        station.setStationCode("ST-SUBA-01");
        when(operationRepository.findById(operation.getId())).thenReturn(Optional.of(operation));
        when(stationRepository.findByStationCode("ST-SUBA-01")).thenReturn(Optional.of(station));

        assertTrue(service.syncNow(operation.getId()));
        verify(stationRepository).delete(station);
        assertEquals("COMPLETED", operation.getStatus());
    }

    private StationLifecycleService serviceReturning(HttpStatus status) {
        WebClient client = WebClient.builder()
                .exchangeFunction(request -> Mono.just(ClientResponse.create(status).build()))
                .build();
        StationLifecycleService result = new StationLifecycleService(
                operationRepository, stationRepository, client);
        ReflectionTestUtils.setField(result, "stationLifecycleUrl", "http://processing/internal/stations/%s");
        ReflectionTestUtils.setField(result, "syncToken", "test-sync-token");
        ReflectionTestUtils.setField(result, "maxAttempts", 8);
        return result;
    }

    private StationLifecycleOperation provisionOperation() {
        StationLifecycleOperation operation = new StationLifecycleOperation();
        operation.setId(UUID.randomUUID());
        operation.setStationCode("ST-SUBA-01");
        operation.setOperationType("PROVISION");
        operation.setName("Estación Suba");
        operation.setLocality("Suba");
        operation.setLatitude(4.74);
        operation.setLongitude(-74.08);
        return operation;
    }
}
