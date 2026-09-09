package com.monitoreo.auth.dto;

import com.monitoreo.auth.entity.StationLifecycleOperation;

import java.util.UUID;

public record StationLifecycleOperationResponse(
        UUID operationId,
        String stationCode,
        String operationType,
        String status,
        String lifecycleStatus,
        int attempts,
        String lastError,
        String name,
        String locality,
        Double latitude,
        Double longitude,
        String message
) {
    public static StationLifecycleOperationResponse from(StationLifecycleOperation operation, String message) {
        String lifecycle = "COMPLETED".equals(operation.getStatus())
                ? "PROVISION".equals(operation.getOperationType()) ? "READY" : "DELETED"
                : "PROVISION".equals(operation.getOperationType()) ? "PROVISIONING" : "DELETING";
        return new StationLifecycleOperationResponse(
                operation.getId(), operation.getStationCode(), operation.getOperationType(),
                operation.getStatus(), lifecycle, operation.getAttemptCount(), operation.getLastError(),
                operation.getName(), operation.getLocality(), operation.getLatitude(), operation.getLongitude(),
                message);
    }
}
