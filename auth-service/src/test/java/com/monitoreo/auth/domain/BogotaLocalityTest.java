package com.monitoreo.auth.domain;

import com.monitoreo.auth.exception.InvalidLocalityException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class BogotaLocalityTest {

    @Test
    void normalizesAccentsCaseAndWhitespaceToOfficialValue() {
        assertEquals(BogotaLocality.USAQUEN, BogotaLocality.from(" usaquen "));
        assertEquals("Usaquén", BogotaLocality.from("USAQUÉN").officialName());
        assertEquals("SAN-CRISTOBAL", BogotaLocality.from("san   cristobal").slug());
        assertEquals("CIUDAD-BOLIVAR", BogotaLocality.from("Ciudad-Bolívar").slug());
    }

    @Test
    void rejectsValuesOutsideOfficialCatalog() {
        assertThrows(InvalidLocalityException.class, () -> BogotaLocality.from("Bogotá"));
    }
}
