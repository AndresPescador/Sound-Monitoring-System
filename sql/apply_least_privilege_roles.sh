#!/usr/bin/env bash

set -euo pipefail

for command_name in docker; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "ERROR: falta el comando requerido: $command_name" >&2
        exit 2
    fi
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_dir="$(cd -- "$script_dir/../docker" && pwd)"

cd "$compose_dir"

docker compose exec -T postgres-auth \
    /docker-entrypoint-initdb.d/01-app-role.sh
docker compose exec -T postgres-auth sh -c \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -f /docker-entrypoint-initdb.d/20-least-privilege.sql'

docker compose exec -T postgres-noise \
    /docker-entrypoint-initdb.d/01-app-roles.sh
docker compose exec -T postgres-noise sh -c \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -f /docker-entrypoint-initdb.d/20-least-privilege.sql'

echo "Roles y privilegios mínimos aplicados correctamente."
