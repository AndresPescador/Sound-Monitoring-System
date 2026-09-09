-- Base de datos: station_registry. Ejecutar como propietario administrativo.
BEGIN;

ALTER TABLE registered_stations
    ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(24) NOT NULL DEFAULT 'READY';

ALTER TABLE registered_stations
    DROP CONSTRAINT IF EXISTS chk_registered_station_lifecycle;
ALTER TABLE registered_stations
    ADD CONSTRAINT chk_registered_station_lifecycle
    CHECK (lifecycle_status IN ('PROVISIONING', 'READY', 'DELETING'));

ALTER TABLE registered_stations
    DROP CONSTRAINT IF EXISTS chk_registered_station_code_format;
ALTER TABLE registered_stations
    ADD CONSTRAINT chk_registered_station_code_format
    CHECK (station_code ~ '^ST-[A-Z0-9]+(-[A-Z0-9]+)*-[0-9]+$') NOT VALID;

CREATE TABLE IF NOT EXISTS station_lifecycle_operations (
    id               UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_code     VARCHAR(50)      NOT NULL,
    operation_type   VARCHAR(20)      NOT NULL,
    name             VARCHAR(150),
    locality         VARCHAR(100),
    description      TEXT,
    address          VARCHAR(255),
    latitude         DOUBLE PRECISION,
    longitude        DOUBLE PRECISION,
    status           VARCHAR(20)      NOT NULL DEFAULT 'PENDING',
    attempt_count    INTEGER          NOT NULL DEFAULT 0,
    next_attempt_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    last_error       TEXT,
    created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_station_lifecycle_operation_type
        CHECK (operation_type IN ('PROVISION', 'DELETE')),
    CONSTRAINT chk_station_lifecycle_operation_status
        CHECK (status IN ('PENDING', 'RETRYING', 'FAILED', 'COMPLETED', 'SUPERSEDED')),
    CONSTRAINT chk_station_lifecycle_provision_snapshot CHECK (
        operation_type <> 'PROVISION' OR
        (name IS NOT NULL AND locality IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_station_lifecycle_operations_due
    ON station_lifecycle_operations (status, next_attempt_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_station_lifecycle_operations_open
    ON station_lifecycle_operations (station_code)
    WHERE status IN ('PENDING', 'RETRYING', 'FAILED');

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE station_lifecycle_operations TO auth_app;

COMMIT;

-- Auditoría previa a validar la restricción heredada:
-- SELECT station_code FROM registered_stations
-- WHERE station_code !~ '^ST-[A-Z0-9]+(-[A-Z0-9]+)*-[0-9]+$';
-- Tras corregir cualquier fila: ALTER TABLE registered_stations
-- VALIDATE CONSTRAINT chk_registered_station_code_format;
