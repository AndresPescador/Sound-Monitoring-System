package com.monitoreo.auth.exception;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GlobalExceptionHandlerTest {

    @Test
    void returnsConflictForDatabaseUniquenessViolations() {
        var response = new GlobalExceptionHandler().handleDataIntegrityViolation(
                new DataIntegrityViolationException("duplicate station code"));

        assertEquals(409, response.getStatusCode().value());
        assertEquals("El código interno ya está en uso. Intenta crear la estación nuevamente.",
                response.getBody().get("error"));
    }
}
