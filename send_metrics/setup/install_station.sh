#!/bin/bash
# Instalación idempotente de la estación completa en Raspberry Pi OS Desktop.

set -euo pipefail

SETUP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR=$(cd -- "$SETUP_DIR/.." && pwd)

if [ "${EUID}" -ne 0 ]; then
    exec sudo -- "$0" "$@"
fi

STATION_USER=${SUDO_USER:-pi}
if ! getent passwd "$STATION_USER" >/dev/null; then
    printf 'ERROR: el usuario de estación %s no existe.\n' "$STATION_USER" >&2
    exit 1
fi

STATION_GROUP=$(id -gn "$STATION_USER")
STATION_UID=$(id -u "$STATION_USER")
STATION_HOME=$(getent passwd "$STATION_USER" | cut -d: -f6)
if [ -z "$STATION_HOME" ] || [ "$STATION_HOME" = "/" ]; then
    printf 'ERROR: directorio personal inseguro para %s: %s.\n' "$STATION_USER" "$STATION_HOME" >&2
    exit 1
fi
VENV_DIR="$PROJECT_DIR/audio_env"
CONFIG_DIR="$STATION_HOME/.config/sound-monitor"
CONFIG_PATH="$CONFIG_DIR/station.toml"
AUTOSTART_DIR="$STATION_HOME/.config/autostart"
SYSTEMCTL_PATH=$(command -v systemctl)
BUILD_DIR="$PROJECT_DIR/recorder/build"

if [ ! -r /etc/os-release ]; then
    printf '%s\n' 'ERROR: no se pudo identificar Raspberry Pi OS.' >&2
    exit 1
fi

. /etc/os-release
if [ "${ID:-}" != "debian" ] && [ "${ID:-}" != "raspbian" ]; then
    printf 'ERROR: plataforma no soportada por el instalador: %s.\n' "${ID:-desconocida}" >&2
    exit 1
fi

printf '%s\n' 'Instalando dependencias del sistema…'
apt-get update
apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    pkg-config \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    libasound2-dev \
    libsndfile1 \
    libsndfile1-dev \
    libtomlplusplus-dev \
    pulseaudio-utils \
    lxterminal

if getent group audio >/dev/null; then
    usermod -a -G audio "$STATION_USER"
fi

if [ ! -x "$VENV_DIR/bin/python" ]; then
    printf '%s\n' 'Creando entorno Python…'
    runuser -u "$STATION_USER" -- python3 -m venv "$VENV_DIR"
fi

printf '%s\n' 'Instalando dependencias Python…'
runuser -u "$STATION_USER" -- "$VENV_DIR/bin/python" -m pip install --upgrade pip
runuser -u "$STATION_USER" -- "$VENV_DIR/bin/python" -m pip install -r "$PROJECT_DIR/requirements.txt"

printf '%s\n' 'Compilando continuous-recorder…'
runuser -u "$STATION_USER" -- cmake \
    -S "$PROJECT_DIR/recorder" \
    -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTING=ON
runuser -u "$STATION_USER" -- cmake --build "$BUILD_DIR" --parallel
runuser -u "$STATION_USER" -- ctest --test-dir "$BUILD_DIR" --output-on-failure
cmake --install "$BUILD_DIR" --prefix /usr/local

printf '%s\n' 'Ejecutando pruebas Python…'
runuser -u "$STATION_USER" -- env PYTHONPATH="$PROJECT_DIR" \
    "$VENV_DIR/bin/python" -m unittest discover -s "$PROJECT_DIR/tests" -v

install -d -m 0700 -o "$STATION_USER" -g "$STATION_GROUP" "$CONFIG_DIR"
install -d -m 0750 -o "$STATION_USER" -g "$STATION_GROUP" \
    "$STATION_HOME/grabaciones" \
    "$PROJECT_DIR/runtime" \
    "$PROJECT_DIR/runtime/audio_stats"
chown -R "$STATION_USER:$STATION_GROUP" "$PROJECT_DIR/runtime"

ln -sfn "$PROJECT_DIR/bin/sound-monitor" /usr/local/bin/sound-monitor

rendered_dir=$(mktemp -d /tmp/sound-monitor-install.XXXXXX)
cleanup() {
    rm -rf -- "$rendered_dir"
}
trap cleanup EXIT

render_service() {
    source_path=$1
    destination_path=$2
    sed \
        -e "s|@STATION_USER@|$STATION_USER|g" \
        -e "s|@STATION_GROUP@|$STATION_GROUP|g" \
        -e "s|@STATION_UID@|$STATION_UID|g" \
        -e "s|@PROJECT_DIR@|$PROJECT_DIR|g" \
        -e "s|@CONFIG_PATH@|$CONFIG_PATH|g" \
        -e "s|@VENV_DIR@|$VENV_DIR|g" \
        "$source_path" > "$rendered_dir/$(basename -- "$destination_path")"
    install -m 0644 "$rendered_dir/$(basename -- "$destination_path")" "$destination_path"
}

printf '%s\n' 'Instalando unidades systemd…'
render_service "$PROJECT_DIR/systemd/continuous-recorder.service.in" /etc/systemd/system/continuous-recorder.service
render_service "$PROJECT_DIR/systemd/process-audio.service.in" /etc/systemd/system/process-audio.service
render_service "$PROJECT_DIR/systemd/send-metrics.service.in" /etc/systemd/system/send-metrics.service

sed \
    -e "s|@STATION_USER@|$STATION_USER|g" \
    -e "s|@SYSTEMCTL@|$SYSTEMCTL_PATH|g" \
    "$SETUP_DIR/sound-monitor-sudoers.in" > "$rendered_dir/sound-monitor-sudoers"
visudo -cf "$rendered_dir/sound-monitor-sudoers"
install -m 0440 "$rendered_dir/sound-monitor-sudoers" /etc/sudoers.d/sound-monitor

printf '%s\n' 'Configurando autoinicio gráfico…'
install -d -m 0755 -o "$STATION_USER" -g "$STATION_GROUP" "$AUTOSTART_DIR"
install -m 0644 -o "$STATION_USER" -g "$STATION_GROUP" \
    "$SETUP_DIR/sound-monitor.desktop.in" \
    "$AUTOSTART_DIR/sound-monitor.desktop"

if command -v raspi-config >/dev/null; then
    raspi-config nonint do_boot_behaviour B4
else
    printf '%s\n' 'AVISO: raspi-config no está disponible; configure el autologin gráfico manualmente.' >&2
fi

systemctl daemon-reload
systemd-analyze verify \
    /etc/systemd/system/continuous-recorder.service \
    /etc/systemd/system/process-audio.service \
    /etc/systemd/system/send-metrics.service

if [ ! -s "$CONFIG_PATH" ]; then
    printf '%s\n' 'Abriendo el asistente inicial…'
    if ! runuser -u "$STATION_USER" -- env \
        HOME="$STATION_HOME" \
        XDG_RUNTIME_DIR="/run/user/$STATION_UID" \
        PULSE_SERVER="unix:/run/user/$STATION_UID/pulse/native" \
        SOUND_MONITOR_CONFIG="$CONFIG_PATH" \
        /usr/local/bin/sound-monitor --setup; then
        printf '%s\n' 'ERROR: la configuración inicial no fue completada.' >&2
        exit 1
    fi
fi

if [ ! -s "$CONFIG_PATH" ]; then
    printf '%s\n' 'ERROR: no se creó la configuración de la estación.' >&2
    exit 1
fi

chown "$STATION_USER:$STATION_GROUP" "$CONFIG_PATH"
chmod 0600 "$CONFIG_PATH"

# La configuración puede apuntar a `pulse`, que pertenece a la sesión del
# usuario de escritorio. Validarla como root produce "Connection refused"
# aunque el micrófono funcione correctamente para el usuario de la estación.
# También detenemos una instalación previa para no competir por un dispositivo
# ALSA exclusivo durante una reinstalación idempotente.
recorder_was_active=0
if systemctl is-active --quiet continuous-recorder.service; then
    recorder_was_active=1
    systemctl stop continuous-recorder.service
fi

printf '%s\n' "Validando captura como $STATION_USER…"
if ! runuser -u "$STATION_USER" -- env \
    HOME="$STATION_HOME" \
    XDG_RUNTIME_DIR="/run/user/$STATION_UID" \
    PULSE_SERVER="unix:/run/user/$STATION_UID/pulse/native" \
    SOUND_MONITOR_CONFIG="$CONFIG_PATH" \
    /usr/local/bin/continuous-recorder validate-config --config "$CONFIG_PATH"; then
    if [ "$recorder_was_active" -eq 1 ]; then
        systemctl start continuous-recorder.service || true
    fi
    printf '%s\n' 'ERROR: la configuración quedó guardada, pero no se pudo abrir el dispositivo de captura.' >&2
    printf '%s\n' 'Abra sound-monitor para cambiar el dispositivo o compruebe la sesión PipeWire/PulseAudio.' >&2
    exit 1
fi

systemctl enable --now continuous-recorder.service process-audio.service send-metrics.service

printf '\n%s\n' 'Sound Monitor quedó instalado.'
printf '%s\n' 'Comando: sound-monitor'
printf '%s\n' 'La TUI se abrirá automáticamente en el próximo inicio de sesión gráfico.'
printf '%s\n' 'Reinicie la Raspberry para aplicar el autologin de escritorio.'
