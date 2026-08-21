-- =============================================================================
-- Bootstrap interactivo del primer superadministrador.
-- Ejecutar con psql únicamente cuando admin_users esté vacía.
--
-- No ejecutar directamente: sql/manage_super_admin.sh define las variables
-- psql después de solicitar el password de forma interactiva.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO admin_users (
    username,
    password_hash,
    is_super,
    is_active,
    credentials_version
)
SELECT
    :'bootstrap_username',
    :'bootstrap_password_hash',
    TRUE,
    TRUE,
    1
WHERE :'bootstrap_username' ~ '^[A-Za-z0-9_-]{3,50}$'
  AND :'bootstrap_password_hash' ~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$'
  AND NOT EXISTS (SELECT 1 FROM admin_users);

\if :ROW_COUNT
    COMMIT;
    \echo 'Superadministrador creado. Elimina el hash del portapapeles.'
\else
    ROLLBACK;
    \echo 'ERROR: datos inválidos o admin_users ya contiene usuarios.'
    \quit 3
\endif
