package com.monitoreo.auth.exception;

public class InvalidLocalityException extends RuntimeException {
    public InvalidLocalityException() {
        super("La localidad no es válida.");
    }

    public InvalidLocalityException(String message) {
        super(message);
    }
}
