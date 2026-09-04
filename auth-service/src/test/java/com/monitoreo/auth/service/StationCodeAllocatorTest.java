package com.monitoreo.auth.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StationCodeAllocatorTest {

    @Mock private JdbcTemplate jdbcTemplate;

    @Test
    void formatsWithAtLeastTwoDigitsAndUsesOneAtomicStatement() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class),
                eq("^ST-CHAPINERO-([0-9]+)$"), eq("^ST-CHAPINERO-([0-9]+)$"), eq("CHAPINERO")))
                .thenReturn(4);

        String code = new StationCodeAllocator(jdbcTemplate).nextCode("CHAPINERO");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForObject(sql.capture(), eq(Integer.class),
                eq("^ST-CHAPINERO-([0-9]+)$"), eq("^ST-CHAPINERO-([0-9]+)$"), eq("CHAPINERO"));
        assertEquals("ST-CHAPINERO-04", code);
        assertTrue(sql.getValue().contains("ON CONFLICT"));
        assertTrue(sql.getValue().contains("RETURNING last_number"));
        assertTrue(sql.getValue().contains("registered_stations"));
    }

    @Test
    void keepsThreeDigitsAfterNinetyNine() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class),
                eq("^ST-SUBA-([0-9]+)$"), eq("^ST-SUBA-([0-9]+)$"), eq("SUBA")))
                .thenReturn(100);

        assertEquals("ST-SUBA-100", new StationCodeAllocator(jdbcTemplate).nextCode("SUBA"));
    }
}
