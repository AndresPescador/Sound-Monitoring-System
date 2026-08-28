@echo off
setlocal EnableExtensions
:: =============================================================================
:: setup_env_windows.bat
:: Prepara el entorno Python de procesamiento, envío y TUI.
:: =============================================================================

set "SETUP_DIR=%~dp0"
for %%I in ("%SETUP_DIR%..") do set "PROJECT_DIR=%%~fI"
set "VENV_DIR=%PROJECT_DIR%\audio_env"

echo =============================================
echo  Setup: Estacion de monitoreo acustico
echo  Windows
echo  Proyecto: %PROJECT_DIR%
echo =============================================

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no esta instalado o no esta en el PATH.
    echo Descargalo desde https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do echo Python encontrado: %%i

if exist "%VENV_DIR%" (
    echo El entorno virtual ya existe: %VENV_DIR%
) else (
    echo Creando entorno virtual: %VENV_DIR%
    python -m venv "%VENV_DIR%"
    if errorlevel 1 exit /b 1
)

call "%VENV_DIR%\Scripts\activate.bat"
python -m pip install --upgrade pip --quiet
python -m pip install -r "%PROJECT_DIR%\requirements.txt"
if errorlevel 1 (
    echo ERROR: no se pudieron instalar las dependencias.
    pause
    exit /b 1
)

echo Verificando instalacion...
python -c "import numpy, soundfile, librosa, scipy, watchdog, httpx, dotenv, textual, rich; print('Dependencias principales: OK')"
if errorlevel 1 (
    echo ERROR: falta alguna dependencia.
    pause
    exit /b 1
)

if not exist "%PROJECT_DIR%\runtime\audio_stats" mkdir "%PROJECT_DIR%\runtime\audio_stats"

echo.
echo =============================================
echo  Entorno listo.
echo.
echo  Activar:
echo    %VENV_DIR%\Scripts\activate.bat
echo.
echo  Ejecutar desde la raiz del proyecto:
echo    python scripts\process_audio.py --watch
echo    python scripts\send_metrics.py
echo =============================================
pause
