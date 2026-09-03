-- Ejecutar como propietario administrativo de station_registry.
-- Repara instalaciones que aplicaron V6 antes de admitir localidades libres.
-- Es idempotente: nunca reduce un consecutivo ya reservado.

BEGIN;

WITH existing_maximums AS (
    SELECT
        regexp_replace(station_code, '^ST-(.+)-[0-9]+$', '\1') AS locality_slug,
        MAX((regexp_match(station_code, '^ST-.+-([0-9]+)$'))[1]::INTEGER) AS last_number
    FROM registered_stations
    WHERE station_code ~ '^ST-[A-Z0-9]+(-[A-Z0-9]+)*-[0-9]+$'
    GROUP BY regexp_replace(station_code, '^ST-(.+)-[0-9]+$', '\1')
)
INSERT INTO station_code_counters (locality_slug, last_number)
SELECT locality_slug, last_number
FROM existing_maximums
ON CONFLICT (locality_slug) DO UPDATE
SET last_number = GREATEST(
        station_code_counters.last_number,
        EXCLUDED.last_number
    ),
    updated_at = NOW();

COMMIT;
