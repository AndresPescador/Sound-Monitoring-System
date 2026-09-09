package com.monitoreo.processing.exception;

public class InvalidStationCodeException extends RuntimeException {
    public InvalidStationCodeException() {
        super("Código de estación no válido.");
    }
}
