package com.monitoreo.auth.exception;

public class InvalidLocalityException extends RuntimeException {
    public InvalidLocalityException() {
        super("La localidad debe pertenecer al catálogo oficial de Bogotá.");
    }
}
