package com.monitoreo.auth.exception;

import java.util.UUID;

public class StationOperationNotFoundException extends RuntimeException {
    public StationOperationNotFoundException(UUID operationId) {
        super("Operación de estación no encontrada: " + operationId);
    }
}
