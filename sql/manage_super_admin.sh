#!/usr/bin/env bash

set -euo pipefail

cleanup() {
    unset admin_password admin_password_confirmation bcrypt_line bcrypt_hash
}
trap cleanup EXIT

usage() {
    echo "Uso: bash sql/manage_super_admin.sh <bootstrap|rotate>" >&2
}

if [[ "${1:-}" != "bootstrap" && "${1:-}" != "rotate" ]]; then
    usage
    exit 2
fi

for command_name in docker htpasswd; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "ERROR: falta el comando requerido: $command_name" >&2
        exit 2
    fi
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_dir="$(cd -- "$script_dir/../docker" && pwd)"
action="$1"

if [[ "$action" == "bootstrap" ]]; then
    prompt="Nuevo username del superadministrador"
    sql_file="$script_dir/init_super_admin.sql"
    username_variable="bootstrap_username"
    hash_variable="bootstrap_password_hash"
else
    prompt="Username del superadministrador a rotar"
    sql_file="$script_dir/rotate_super_admin.sql"
    username_variable="rotation_username"
    hash_variable="rotation_password_hash"
fi

read -r -p "$prompt: " admin_username
if [[ ! "$admin_username" =~ ^[A-Za-z0-9_-]{3,50}$ ]]; then
    echo "ERROR: usa entre 3 y 50 letras, números, guiones o guiones bajos." >&2
    exit 2
fi

read -r -s -p "Password nuevo (mínimo 12 caracteres): " admin_password
echo
read -r -s -p "Confirmar password: " admin_password_confirmation
echo

if [[ "${#admin_password}" -lt 12 ]]; then
    echo "ERROR: el password debe tener al menos 12 caracteres." >&2
    exit 2
fi
if [[ "$admin_password" != "$admin_password_confirmation" ]]; then
    echo "ERROR: los passwords no coinciden." >&2
    exit 2
fi

bcrypt_line="$(printf '%s\n' "$admin_password" | htpasswd -niBC 12 "$admin_username")"
bcrypt_hash="${bcrypt_line#*:}"
unset admin_password admin_password_confirmation bcrypt_line

cd "$compose_dir"
docker compose exec -T \
    -e "ADMIN_OPERATION_USERNAME=$admin_username" \
    -e "ADMIN_OPERATION_HASH=$bcrypt_hash" \
    -e "ADMIN_USERNAME_VARIABLE=$username_variable" \
    -e "ADMIN_HASH_VARIABLE=$hash_variable" \
    postgres-auth sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -v "$ADMIN_USERNAME_VARIABLE=$ADMIN_OPERATION_USERNAME" \
        -v "$ADMIN_HASH_VARIABLE=$ADMIN_OPERATION_HASH"' \
    < "$sql_file"

unset bcrypt_hash
