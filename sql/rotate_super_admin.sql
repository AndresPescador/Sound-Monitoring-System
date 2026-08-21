-- =============================================================================
-- Rotación interactiva del password de un superadministrador existente.
-- Requiere haber aplicado V3__admin_credentials_version.sql.
--
-- La actualización incrementa credentials_version e invalida inmediatamente
-- todos los JWT administrativos emitidos previamente para esa cuenta.
-- No ejecutar directamente: sql/manage_super_admin.sh define las variables
-- psql después de solicitar el password de forma interactiva.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

UPDATE admin_users
SET password_hash = :'rotation_password_hash',
    credentials_version = credentials_version + 1,
    updated_at = NOW()
WHERE username = :'rotation_username'
  AND is_super = TRUE
  AND :'rotation_password_hash' ~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$';

\if :ROW_COUNT
    COMMIT;
    \echo 'Password rotado y sesiones administrativas anteriores revocadas.'
\else
    ROLLBACK;
    \echo 'ERROR: superadministrador inexistente o hash BCrypt inválido.'
    \quit 3
\endif
