package com.monitoreo.auth.service;

import com.monitoreo.auth.exception.InvalidLocalityException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LocalitySlugTest {

    @Test
    void normalizesCustomLocalitiesWithoutChangingTheirDisplayValue() {
        assertEquals("CHIA", LocalitySlug.from(" Chía "));
        assertEquals("SAN-ANDRES-ISLA", LocalitySlug.from("San Andrés / Isla"));
        assertEquals("Chía", LocalitySlug.displayName(" Chía "));
    }

    @Test
    void rejectsSlugsThatCannotFitInAStationCode() {
        assertThrows(InvalidLocalityException.class,
                () -> LocalitySlug.from("A".repeat(45)));
    }
}
