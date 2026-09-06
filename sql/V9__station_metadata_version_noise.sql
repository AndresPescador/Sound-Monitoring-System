-- Base de datos: noise_analytics. Ejecutar como propietario administrativo.
ALTER TABLE stations
    ADD COLUMN IF NOT EXISTS metadata_version BIGINT NOT NULL DEFAULT 0;
