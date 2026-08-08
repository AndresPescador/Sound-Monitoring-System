-- =============================================================================
-- Base de datos: station_registry
-- Descripción:   Almacena las credenciales y tokens de autenticación de las
--                estaciones de monitoreo. Completamente aislada de la base de
--                datos de métricas acústicas por seguridad.
--
-- Uso:
--   psql -U postgres -c "CREATE DATABASE station_registry;"
--   psql -U postgres -d station_registry -f schema_station_registry.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================================================
-- TABLA: registered_stations
-- Registro oficial de todas las estaciones autorizadas para enviar datos.
-- El Station Authentication Service es el único que escribe en esta tabla.
-- =============================================================================
CREATE TABLE IF NOT EXISTS registered_stations (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Debe coincidir exactamente con stations.station_code en noise_analytics
    -- El backend de procesamiento usa este código para relacionar ambas BDs
    station_code    VARCHAR(50)     NOT NULL UNIQUE,

    name            VARCHAR(150)    NOT NULL,
    description     TEXT,
    locality        VARCHAR(100)    NOT NULL,

    -- Estado de la estación
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,

    -- Hash del secret de la estación (nunca se guarda el secret en claro)
    -- La estación usa este secret para firmar sus peticiones o solicitar tokens JWT
    secret_hash     TEXT            NOT NULL,

    registered_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  registered_stations             IS 'Estaciones autorizadas para enviar datos al sistema. Gestionada exclusivamente por el Station Authentication Service.';
COMMENT ON COLUMN registered_stations.station_code IS 'Debe coincidir con stations.station_code en noise_analytics para correlacionar datos.';
COMMENT ON COLUMN registered_stations.secret_hash  IS 'Hash bcrypt del secret de la estación. Nunca se almacena el secret en texto plano.';
COMMENT ON COLUMN registered_stations.is_active    IS 'False = estación desactivada. Sus tokens existentes serán rechazados.';


-- =============================================================================
-- TABLA: api_tokens
-- Tokens JWT emitidos por el Station Authentication Service.
-- Cada estación puede tener un token activo a la vez.
-- Se registra cada emisión y revocación para trazabilidad completa.
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_tokens (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id      UUID            NOT NULL REFERENCES registered_stations(id) ON DELETE CASCADE,

    -- Identificador único del token (claim "jti" del JWT)
    -- Permite revocar un token específico sin afectar otros
    jti             VARCHAR(255)    NOT NULL UNIQUE,

    -- Estado del token
    is_revoked      BOOLEAN         NOT NULL DEFAULT FALSE,

    issued_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ     NOT NULL,

    -- Registro de revocación (si aplica)
    revoked_at      TIMESTAMPTZ,
    revocation_reason VARCHAR(255),

    occurred_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  api_tokens            IS 'Tokens JWT emitidos a las estaciones. Permite validación, expiración y revocación individual.';
COMMENT ON COLUMN api_tokens.jti        IS 'JWT ID: identificador único del token incluido en el claim jti. Usado para validación y revocación.';
COMMENT ON COLUMN api_tokens.is_revoked IS 'True = token invalidado manualmente antes de su expiración.';
COMMENT ON COLUMN api_tokens.expires_at IS 'Fecha de expiración del token. El backend rechaza tokens con expires_at en el pasado.';

-- Índices para validación rápida de tokens en cada petición de ingesta
CREATE INDEX IF NOT EXISTS idx_tokens_jti
    ON api_tokens (jti);

CREATE INDEX IF NOT EXISTS idx_tokens_station_active
    ON api_tokens (station_id, is_revoked, expires_at);


-- =============================================================================
-- TABLA: auth_audit_log
-- Registro de todos los eventos de autenticación del sistema.
-- Permite detectar intentos de acceso no autorizados, tokens inválidos,
-- y tener trazabilidad completa de quién envió qué y cuándo.
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth_audit_log (
    id              BIGSERIAL       PRIMARY KEY,

    -- NULL si el evento es de una estación no registrada (intento inválido)
    station_id      UUID            REFERENCES registered_stations(id) ON DELETE SET NULL,

    event_type      VARCHAR(50)     NOT NULL,
    -- Valores posibles:
    --   TOKEN_ISSUED       → se emitió un token nuevo
    --   TOKEN_VALIDATED    → token validado exitosamente en una petición de ingesta
    --   TOKEN_REJECTED     → token inválido, expirado o revocado
    --   TOKEN_REVOKED      → token revocado manualmente
    --   STATION_REGISTERED → nueva estación registrada
    --   STATION_DEACTIVATED→ estación desactivada

    -- Resultado del evento
    success         BOOLEAN         NOT NULL,
    detail          TEXT,                        -- Descripción adicional del evento

    occurred_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  auth_audit_log            IS 'Log de auditoría de todos los eventos de autenticación. Solo INSERT, nunca UPDATE ni DELETE.';
COMMENT ON COLUMN auth_audit_log.event_type IS 'Tipo de evento: TOKEN_ISSUED, TOKEN_VALIDATED, TOKEN_REJECTED, TOKEN_REVOKED, STATION_REGISTERED, STATION_DEACTIVATED.';
COMMENT ON COLUMN auth_audit_log.station_id IS 'NULL si el intento proviene de una estación no reconocida.';

-- Índice para consultas de auditoría por estación y por fecha
CREATE INDEX IF NOT EXISTS idx_audit_station_time
    ON auth_audit_log (station_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_event_type
    ON auth_audit_log (event_type, occurred_at DESC);

-- =============================================================================
-- MIGRACIÓN INTEGRADA: V2__admin_users.sql (soporte de administradores)
-- Integrada al schema para que un deploy limpio cree admin_users automáticamente.
-- =============================================================================
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
