-- =============================================================================
-- Migración: V2__admin_users.sql
-- Base de datos: station_registry
-- Descripción: Agrega soporte para administradores humanos del sistema.
--
-- Cambios:
--   1. Nueva tabla admin_users
--   2. Columnas admin_user_id e ip_address en auth_audit_log
--   3. Nuevos valores de event_type documentados en comentario
--   4. Índices de soporte
--
-- Aplicar con:
--   psql -U auth_user -d station_registry -f V2__admin_users.sql
-- =============================================================================


-- -----------------------------------------------------------------------------
-- TABLA: admin_users
-- Administradores humanos del sistema. Solo el super-admin puede crear otros.
-- El primer super-admin se inserta via script de inicialización (init_super_admin.sql),
-- nunca mediante un endpoint público.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    username        VARCHAR(50) NOT NULL UNIQUE,

    -- Hash BCrypt del password (cost 12). Nunca se almacena en texto plano.
    password_hash   VARCHAR(60) NOT NULL,

    -- Solo TRUE para el primer administrador creado via script de inicialización.
    -- Un super-admin puede crear admins normales (is_super = FALSE).
    -- Los admins normales no pueden crear otros admins.
    is_super        BOOLEAN     NOT NULL DEFAULT FALSE,

    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

COMMENT ON TABLE  admin_users            IS 'Administradores humanos del sistema. Gestionados exclusivamente por el Auth Service.';
COMMENT ON COLUMN admin_users.is_super   IS 'TRUE solo para el primer admin creado via script. Permite crear otros admins.';
COMMENT ON COLUMN admin_users.password_hash IS 'Hash BCrypt cost 12. Nunca se almacena el password en texto plano.';

CREATE INDEX IF NOT EXISTS idx_admin_users_username
    ON admin_users (username);


-- -----------------------------------------------------------------------------
-- ALTERACIONES: auth_audit_log
-- Se agregan columnas para trazabilidad de acciones de administradores.
-- Las columnas son nullable para mantener compatibilidad con registros existentes
-- que corresponden a eventos de estaciones (no de admins).
-- -----------------------------------------------------------------------------

-- Qué admin realizó la acción (NULL si el evento es de una estación)
ALTER TABLE auth_audit_log
    ADD COLUMN IF NOT EXISTS admin_user_id UUID
        REFERENCES admin_users(id) ON DELETE SET NULL;

-- IP de origen de la petición (útil para auditoría de accesos admin)
ALTER TABLE auth_audit_log
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

COMMENT ON COLUMN auth_audit_log.admin_user_id IS 'Admin que realizó la acción. NULL si el evento es de una estación (token, ingesta).';
COMMENT ON COLUMN auth_audit_log.ip_address    IS 'IP de origen de la petición HTTP. Útil para detectar accesos sospechosos.';

-- Índice para consultas de auditoría por admin
CREATE INDEX IF NOT EXISTS idx_audit_admin_user
    ON auth_audit_log (admin_user_id, occurred_at DESC);


-- -----------------------------------------------------------------------------
-- DOCUMENTACIÓN: nuevos valores de event_type en auth_audit_log
--
-- Eventos existentes (estaciones):
--   TOKEN_ISSUED        → JWT emitido a una estación
--   TOKEN_VALIDATED     → JWT validado en ingesta
--   TOKEN_REJECTED      → JWT inválido, expirado o revocado
--   TOKEN_REVOKED       → JWT revocado manualmente
--   STATION_REGISTERED  → nueva estación registrada
--   STATION_DEACTIVATED → estación desactivada
--
-- Nuevos eventos (administradores):
--   ADMIN_LOGIN              → login exitoso de un admin
--   ADMIN_LOGIN_FAILED       → intento de login fallido (usuario o password incorrecto)
--   ADMIN_PASSWORD_CHANGED   → admin cambió su propio password
--   ADMIN_CREATED            → super-admin creó un nuevo admin
--   STATION_CREATED          → admin creó una estación (reemplaza STATION_REGISTERED)
--   STATION_UPDATED          → admin actualizó datos de una estación
--   STATION_SECRET_ROTATED   → admin rotó el secret de una estación
--   STATION_DELETED          → admin eliminó una estación
--   STATION_STATUS_CHANGED   → admin activó o desactivó una estación
-- -----------------------------------------------------------------------------
