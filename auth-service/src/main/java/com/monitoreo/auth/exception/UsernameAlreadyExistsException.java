package com.monitoreo.auth.exception;

public class UsernameAlreadyExistsException extends RuntimeException {
    public UsernameAlreadyExistsException(String username) {
        super("Ya existe un administrador con el username: " + username);
    }
}