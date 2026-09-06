-- Base de datos: station_registry. Ejecutar como propietario administrativo.
ALTER TABLE registered_stations
    ADD COLUMN IF NOT EXISTS metadata_version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS station_metadata_sync (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_code     VARCHAR(50) NOT NULL,
    metadata_version BIGINT NOT NULL,
    name             VARCHAR(150) NOT NULL,
    locality         VARCHAR(100) NOT NULL,
    description      TEXT,
    address          VARCHAR(255),
    latitude         DOUBLE PRECISION NOT NULL,
    longitude        DOUBLE PRECISION NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempt_count    INTEGER NOT NULL DEFAULT 0,
    next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_station_metadata_sync_version UNIQUE (station_code, metadata_version)
);
CREATE INDEX IF NOT EXISTS idx_station_metadata_sync_due
    ON station_metadata_sync (status, next_attempt_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE station_metadata_sync TO auth_app;
