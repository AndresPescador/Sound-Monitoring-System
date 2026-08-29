-- Ejecutar como propietario administrativo de station_registry antes de desplegar
-- la versión de Auth que genera códigos automáticamente.

BEGIN;

CREATE TABLE IF NOT EXISTS station_code_counters (
    locality_slug   VARCHAR(100)    PRIMARY KEY,
    last_number     INTEGER         NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_station_code_counters_last_number CHECK (last_number >= 0)
);

WITH official_localities(locality_slug) AS (
    VALUES
        ('ANTONIO-NARINO'), ('BARRIOS-UNIDOS'), ('BOSA'), ('CHAPINERO'),
        ('CIUDAD-BOLIVAR'), ('ENGATIVA'), ('FONTIBON'), ('KENNEDY'),
        ('LA-CANDELARIA'), ('LOS-MARTIRES'), ('PUENTE-ARANDA'),
        ('RAFAEL-URIBE-URIBE'), ('SAN-CRISTOBAL'), ('SANTA-FE'), ('SUBA'),
        ('SUMAPAZ'), ('TEUSAQUILLO'), ('TUNJUELITO'), ('USAQUEN'), ('USME')
), existing_maximums AS (
    SELECT
        locality.locality_slug,
        COALESCE(MAX(CAST(SUBSTRING(
            station.station_code
            FROM LENGTH('ST-' || locality.locality_slug || '-') + 1
        ) AS INTEGER)), 0) AS last_number
    FROM official_localities locality
    LEFT JOIN registered_stations station
        ON station.station_code ~ ('^ST-' || locality.locality_slug || '-[0-9]+$')
    GROUP BY locality.locality_slug
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

GRANT SELECT, INSERT, UPDATE ON TABLE station_code_counters TO auth_app;

COMMENT ON TABLE station_code_counters IS 'Último consecutivo asignado por localidad para generar station_code sin colisiones.';

COMMIT;
