#!/usr/bin/env bash

set -euo pipefail

: "${AUTH_DB_PASSWORD:?AUTH_DB_PASSWORD es obligatoria}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password AUTH_DB_PASSWORD

SELECT 'CREATE ROLE auth_app LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_app')
\gexec

SELECT format(
    'ALTER ROLE auth_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    :'app_password'
)
\gexec

ALTER ROLE auth_app SET search_path = pg_catalog, public;
SQL
