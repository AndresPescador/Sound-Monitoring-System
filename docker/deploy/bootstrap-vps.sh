#!/usr/bin/env bash
# One-time root setup for the GitHub Actions deployment identity.
set -Eeuo pipefail

APP_ROOT="/opt/sound-monitoring"
RELEASE_ROOT="$APP_ROOT/releases"
STATE_ROOT="$RELEASE_ROOT/.state"
DEPLOY_USER="sound-deploy"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="$SCRIPT_DIR/sound-monitoring-deploy"

die() {
  printf '[sound-monitoring-bootstrap] ERROR: %s\n' "$*" >&2
  exit 1
}

[[ ${EUID} -eq 0 ]] || die "must run as root"
[[ $# -eq 1 ]] || die "usage: $0 <public-key-file>"

public_key_file="$1"
[[ -f "$public_key_file" ]] || die "public key file does not exist"
[[ -s "$public_key_file" ]] || die "public key file is empty"
[[ -x "$DEPLOY_SCRIPT" ]] || die "deployment script is missing or not executable"
[[ -d "$APP_ROOT/docker" ]] || die "existing deployment directory is missing"
[[ -f "$APP_ROOT/docker/.env" ]] || die "production docker/.env is missing"

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash --user-group "$DEPLOY_USER"
fi
usermod --password '!' "$DEPLOY_USER"

deploy_group="$(id -gn "$DEPLOY_USER")"
install -d -o "$DEPLOY_USER" -g "$deploy_group" -m 0700 "/home/$DEPLOY_USER/.ssh"
install -o "$DEPLOY_USER" -g "$deploy_group" -m 0600 \
  "$public_key_file" "/home/$DEPLOY_USER/.ssh/authorized_keys"

install -d -o root -g root -m 0755 "$RELEASE_ROOT"
install -d -o root -g root -m 0700 "$STATE_ROOT"
chmod 0600 "$APP_ROOT/docker/.env"
install -o root -g root -m 0750 "$DEPLOY_SCRIPT" /usr/local/sbin/sound-monitoring-deploy

cat > /etc/sudoers.d/sound-monitoring-deploy <<'EOF'
sound-deploy ALL=(root) NOPASSWD: /usr/local/sbin/sound-monitoring-deploy
EOF
chmod 0440 /etc/sudoers.d/sound-monitoring-deploy
visudo -cf /etc/sudoers.d/sound-monitoring-deploy >/dev/null

current_file="$STATE_ROOT/current"
if [[ ! -s "$current_file" ]]; then
  baseline_dir="$RELEASE_ROOT/bootstrap-current"
  install -d -o root -g root -m 0755 "$baseline_dir"
  tar -C "$APP_ROOT" \
    --exclude='.env' \
    --exclude='*/.env' \
    --exclude='*/node_modules' \
    --exclude='*/dist' \
    --exclude='*/target' \
    -cf - \
    auth-service \
    noise-processing-backend \
    ingestion-api \
    dashboard-api \
    dashboard-frontend \
    docker \
    sql \
    schema_noise_analytics.sql \
    schema_station_registry.sql \
    | tar -C "$baseline_dir" --no-same-owner --no-same-permissions -xf -
  cat > "$baseline_dir/DEPLOY_MANIFEST" <<'EOF'
commit_sha=bootstrap-current
database_change=false
requires_manual_vps_setup=false
deployment_entrypoint_sha=bootstrap-current
services=auth-service,noise-processing,ingestion-api,dashboard-api,dashboard-frontend,nginx
EOF
  printf 'bootstrap-current\n' > "$current_file"
fi

printf '[sound-monitoring-bootstrap] Deployment user and rollback baseline are ready.\n'
