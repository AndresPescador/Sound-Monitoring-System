-- Base de datos: noise_analytics. Ejecutar como propietario administrativo.
BEGIN;

ALTER TABLE stations
    DROP CONSTRAINT IF EXISTS chk_station_code_format;
ALTER TABLE stations
    ADD CONSTRAINT chk_station_code_format
    CHECK (station_code ~ '^ST-[A-Z0-9]+(-[A-Z0-9]+)*-[0-9]+$') NOT VALID;

COMMIT;

-- Auditoría previa a validar la restricción heredada:
-- SELECT station_code FROM stations
-- WHERE station_code !~ '^ST-[A-Z0-9]+(-[A-Z0-9]+)*-[0-9]+$';
-- Tras corregir cualquier fila: ALTER TABLE stations
-- VALIDATE CONSTRAINT chk_station_code_format;
