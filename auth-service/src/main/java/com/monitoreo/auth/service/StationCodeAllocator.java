package com.monitoreo.auth.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
public class StationCodeAllocator {

    private static final String NEXT_NUMBER_SQL = """
            WITH existing_codes AS (
                SELECT COALESCE(MAX((regexp_match(station_code, ?))[1]::INTEGER), 0) AS last_number
                FROM registered_stations
                WHERE station_code ~ ?
            )
            INSERT INTO station_code_counters (locality_slug, last_number, updated_at)
            VALUES (?, (SELECT last_number + 1 FROM existing_codes), NOW())
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
        String stationCodePattern = "^ST-" + localitySlug + "-([0-9]+)$";
        Integer nextNumber = jdbcTemplate.queryForObject(
                NEXT_NUMBER_SQL, Integer.class, stationCodePattern, stationCodePattern, localitySlug);
        if (nextNumber == null || nextNumber < 1) {
            throw new IllegalStateException("No fue posible asignar el código de estación.");
        }
        return String.format(Locale.ROOT, "ST-%s-%02d", localitySlug, nextNumber);
    }
}
