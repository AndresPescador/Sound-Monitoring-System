package com.monitoreo.processing.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.OffsetDateTime;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(StationNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(StationNotFoundException ex) {
        return buildResponse(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(StationAlreadyExistsException.class)
    public ResponseEntity<Map<String, Object>> handleConflict(StationAlreadyExistsException ex) {
        return buildResponse(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        log.error("Error inesperado: {}", ex.getMessage(), ex);
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno del servidor.");
    }

        @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<Map<String,String>> handle(InvalidCredentialsException ex) {
        return ResponseEntity.status(401).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<Map<String,String>> handle(ForbiddenException ex) {
        return ResponseEntity.status(403).body(Map.of("error", ex.getMessage()));
    }

    private ResponseEntity<Map<String, Object>> buildResponse(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of(
                "status", status.value(),
                "error", message,
                "timestamp", OffsetDateTime.now().toString()
        ));
    }
}
