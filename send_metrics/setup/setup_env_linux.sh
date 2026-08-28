#!/bin/bash
# =============================================================================
# setup_env_linux.sh
# Prepara el entorno común de process_audio.py y send_metrics.py.
# Compatible con Raspberry Pi OS, Ubuntu y Debian.
#
# Se puede ejecutar desde cualquier carpeta:
#   ./setup/setup_env_linux.sh
# =============================================================================

set -e

SETUP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SETUP_DIR/.." && pwd)"
VENV_DIR="$PROJECT_DIR/audio_env"

echo "============================================="
echo " Setup: Estación de monitoreo acústico"
echo " Linux / Raspberry Pi"
echo " Proyecto: $PROJECT_DIR"
echo "============================================="

if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 no está instalado. Instalando..."
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python encontrado: $PYTHON_VERSION"

echo "Verificando dependencias del sistema..."
sudo apt update -qq
sudo apt install -y \
    python3-venv \
    python3-dev \
    libsndfile1 \
    libsndfile1-dev \
    libasound2-dev \
    --no-install-recommends

if [ -d "$VENV_DIR" ]; then
    echo "El entorno virtual ya existe: $VENV_DIR"
else
    echo "Creando entorno virtual: $VENV_DIR"
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip --quiet

echo "Instalando dependencias Python..."
python -m pip install -r "$PROJECT_DIR/requirements.txt"

echo "Verificando instalación..."
python - <<'PY'
import importlib
import sys

dependencies = {
    "numpy": "numpy",
    "soundfile": "soundfile",
    "librosa": "librosa",
    "scipy": "scipy",
    "watchdog": "watchdog",
    "httpx": "httpx",
    "dotenv": "dotenv",
    "textual": "textual",
    "rich": "rich",
}

failed = []
for label, module_name in dependencies.items():
    try:
        module = importlib.import_module(module_name)
        version = getattr(module, "__version__", "instalado")
        print(f"  OK  {label:<10} {version}")
    except ImportError as exc:
        print(f"  ERROR {label:<8} {exc}")
        failed.append(label)

if failed:
    sys.exit("Fallaron dependencias: " + ", ".join(failed))
PY

mkdir -p "$PROJECT_DIR/runtime/audio_stats"

echo ""
echo "============================================="
echo " Entorno listo."
echo ""
echo " Activar:"
echo "   source $VENV_DIR/bin/activate"
echo ""
echo " Ejecutar desde la raíz del proyecto:"
echo "   python scripts/process_audio.py --watch"
echo "   python scripts/send_metrics.py"
echo "============================================="
