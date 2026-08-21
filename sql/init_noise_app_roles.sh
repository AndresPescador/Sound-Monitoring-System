#!/usr/bin/env bash

set -euo pipefail

: "${NOISE_PROCESSOR_DB_PASSWORD:?NOISE_PROCESSOR_DB_PASSWORD es obligatoria}"
: "${DASHBOARD_DB_PASSWORD:?DASHBOARD_DB_PASSWORD es obligatoria}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv writer_password NOISE_PROCESSOR_DB_PASSWORD
\getenv reader_password DASHBOARD_DB_PASSWORD

SELECT 'CREATE ROLE noise_writer LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'noise_writer')
\gexec

SELECT 'CREATE ROLE dashboard_reader LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_reader')
\gexec

SELECT format(
    'ALTER ROLE noise_writer WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    :'writer_password'
)
\gexec

SELECT format(
    'ALTER ROLE dashboard_reader WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    :'reader_password'
)
\gexec

ALTER ROLE noise_writer SET search_path = pg_catalog, public;
ALTER ROLE dashboard_reader SET search_path = pg_catalog, public;
ALTER ROLE dashboard_reader SET default_transaction_read_only = on;
ALTER ROLE dashboard_reader SET statement_timeout = '5s';
ALTER ROLE dashboard_reader SET lock_timeout = '1s';
ALTER ROLE dashboard_reader SET idle_in_transaction_session_timeout = '5s';
SQL
