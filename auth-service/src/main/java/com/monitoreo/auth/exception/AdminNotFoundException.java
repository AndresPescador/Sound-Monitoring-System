package com.monitoreo.auth.exception;

public class AdminNotFoundException extends RuntimeException {
    public AdminNotFoundException(String username) {
        super("Administrador no encontrado: " + username);
    }
}