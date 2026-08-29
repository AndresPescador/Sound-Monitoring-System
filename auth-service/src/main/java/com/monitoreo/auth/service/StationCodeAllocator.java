package com.monitoreo.auth.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
public class StationCodeAllocator {

    private static final String NEXT_NUMBER_SQL = """
            INSERT INTO station_code_counters (locality_slug, last_number, updated_at)
            VALUES (?, 1, NOW())
            ON CONFLICT (locality_slug) DO UPDATE
            SET last_number = station_code_counters.last_number + 1,
                updated_at = NOW()
            RETURNING last_number
            """;

    private final JdbcTemplate jdbcTemplate;

    public StationCodeAllocator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public String nextCode(String localitySlug) {
        Integer nextNumber = jdbcTemplate.queryForObject(
                NEXT_NUMBER_SQL, Integer.class, localitySlug);
        if (nextNumber == null || nextNumber < 1) {
            throw new IllegalStateException("No fue posible asignar el código de estación.");
        }
        return String.format(Locale.ROOT, "ST-%s-%02d", localitySlug, nextNumber);
    }
}
