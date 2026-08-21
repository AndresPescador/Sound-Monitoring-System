-- =============================================================================
-- Migración: V3__admin_credentials_version.sql
-- Base de datos: station_registry
-- Descripción: permite revocar todos los JWT de un administrador al cambiar
--              sus credenciales.
-- =============================================================================

ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS credentials_version BIGINT NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_admin_users_credentials_version'
          AND conrelid = 'admin_users'::regclass
    ) THEN
        ALTER TABLE admin_users
            ADD CONSTRAINT chk_admin_users_credentials_version
            CHECK (credentials_version >= 1);
    END IF;
END
$$;

COMMENT ON COLUMN admin_users.credentials_version IS
    'Versión de credenciales incluida en JWT admin. Incrementarla revoca sesiones previas.';
