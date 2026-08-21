# Estación de monitoreo acústico

Esta carpeta contiene los programas que se ejecutan en cada Raspberry Pi. La Raspberry procesa los archivos `.wav`, genera métricas acústicas y las envía al servidor central.

## 1. Organización de la carpeta

La estructura esperada es:

```text
send_metrics/
├── README.md
├── .env.example              # Plantilla; copiar como .env y completar
├── .env                      # Configuración real; nunca versionar
├── requirements.txt          # Dependencias de ambos scripts
├── audio_env/                # Entorno virtual local; ignorado por Git
├── scripts/
│   ├── process_audio.py      # Analiza los WAV
│   ├── send_metrics.py       # Envía las métricas
│   └── index_lock.py         # Bloqueo compartido de index.json
├── setup/
│   ├── setup_env_linux.sh    # Instalación para Raspberry Pi/Linux
│   └── setup_env_windows.bat # Instalación para Windows
└── runtime/                  # Datos generados; ignorado por Git
    ├── audio_stats/          # JSON de métricas con extensión .txt
    ├── token.json            # JWT de la estación
    ├── failed_files.json     # Contadores de fallos
    ├── send_metrics.log
    └── audio_processing_log.log
```

`process_audio.py` y `send_metrics.py` deben usar la misma carpeta `runtime/audio_stats`. Los archivos de `runtime/` son datos locales de la estación y no deben copiarse al repositorio ni compartirse públicamente.

## 2. Instalación en una Raspberry Pi

### 2.1 Copiar el proyecto

Copiar la carpeta `send_metrics` completa a la Raspberry, por ejemplo:

```bash
mkdir -p /home/pi/Sound-Monitoring-System
cp -r send_metrics /home/pi/Sound-Monitoring-System/
cd /home/pi/Sound-Monitoring-System/send_metrics
```

La ruta puede ser diferente, pero debe conservarse la estructura anterior.

### 2.2 Configurar la estación

Crear la configuración real a partir de la plantilla:

```bash
cp .env.example .env
nano .env
```

Completar al menos:

```dotenv
STATION_CODE=ST-CODIGO-DE-LA-ESTACION
STATION_SECRET=secret_entregado_al_registrar_la_estacion
SERVER_URL=http://IP_DEL_SERVIDOR
RUNTIME_DIR=./runtime
METRICS_OUTPUT_DIR=./runtime/audio_stats
```

`SERVER_URL` debe ser la dirección del servidor central, no `localhost`. El `STATION_CODE` y el `STATION_SECRET` deben corresponder a una estación registrada tanto en Auth Service como en Noise Processing.

No incluir el contenido real de `.env` en logs, issues, commits ni capturas de pantalla.

### 2.3 Instalar las dependencias

Ejecutar una sola vez:

```bash
chmod +x setup/setup_env_linux.sh
./setup/setup_env_linux.sh
```

El instalador:

- prepara las dependencias del sistema para audio;
- crea `audio_env/` en la raíz de `send_metrics`;
- instala las dependencias de procesamiento y envío;
- crea `runtime/audio_stats/`;
- verifica las importaciones principales.

Activar el entorno cada vez que se vaya a ejecutar manualmente:

```bash
source audio_env/bin/activate
```

## 3. Preparar la carpeta de grabaciones

El programa de grabación debe guardar los `.wav` en una carpeta conocida. Por ejemplo:

```bash
mkdir -p /home/pi/grabaciones
```

Los nombres deberían conservar el formato usado para extraer el timestamp:

```text
Rec 2026-08-20 18h27m31s 1.wav
```

El script acepta otros nombres, pero si no encuentra ese patrón intentará usar la fecha de modificación del archivo.

## 4. Probar el procesamiento y el envío

Antes de instalar servicios automáticos, hacer una prueba manual.

### 4.1 Procesar un lote de archivos

```bash
source audio_env/bin/activate
python scripts/process_audio.py \
  --folder /home/pi/grabaciones \
  --output /home/pi/Sound-Monitoring-System/send_metrics/runtime/audio_stats
```

Por cada `.wav` válido se crea un archivo `.txt` cuyo contenido es JSON. También se actualiza:

```text
runtime/audio_stats/index.json
```

El `.wav` se elimina después de procesarse correctamente según la lógica actual del procesador. Para una prueba, utilizar copias de los audios originales.

### 4.2 Revisar la cola local

```bash
python scripts/send_metrics.py --status
```

### 4.3 Ejecutar un único ciclo de envío

```bash
python scripts/send_metrics.py --once
```

### 4.4 Revisar logs

```bash
tail -f runtime/audio_processing_log.log
tail -f runtime/send_metrics.log
```

El envío sigue este recorrido:

```text
Raspberry
  → POST /auth/token
  → POST /ingest/ingest
  → Ingestion API
  → Processing Backend
  → PostgreSQL
```

Una respuesta `201` indica una medición nueva. Una respuesta `200` indica que el fragmento ya estaba almacenado y fue ignorado como duplicado.

## 5. Operación normal en modo continuo

### Procesador de audio

```bash
source audio_env/bin/activate
python scripts/process_audio.py --watch \
  --folder /home/pi/grabaciones \
  --output /home/pi/Sound-Monitoring-System/send_metrics/runtime/audio_stats
```

### Emisor de métricas

En otra terminal:

```bash
source audio_env/bin/activate
python scripts/send_metrics.py
```

`process_audio.py` detecta nuevos WAV y `send_metrics.py` consulta la cola cada 30 segundos por defecto.

## 6. Arranque automático con systemd

Para una estación permanente se recomienda usar dos servicios separados.

### 6.1 Servicio del procesador

Crear `/etc/systemd/system/process-audio.service`:

```ini
[Unit]
Description=Procesamiento de audio de la estación
After=local-fs.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Sound-Monitoring-System/send_metrics
ExecStart=/home/pi/Sound-Monitoring-System/send_metrics/audio_env/bin/python /home/pi/Sound-Monitoring-System/send_metrics/scripts/process_audio.py --watch --folder /home/pi/grabaciones --output /home/pi/Sound-Monitoring-System/send_metrics/runtime/audio_stats
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 6.2 Servicio del emisor

Crear `/etc/systemd/system/send-metrics.service`:

```ini
[Unit]
Description=Envío de métricas acústicas de la estación
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Sound-Monitoring-System/send_metrics
ExecStart=/home/pi/Sound-Monitoring-System/send_metrics/audio_env/bin/python /home/pi/Sound-Monitoring-System/send_metrics/scripts/send_metrics.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Activar ambos servicios:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now process-audio.service
sudo systemctl enable --now send-metrics.service
```

Comprobar estado y logs:

```bash
systemctl status process-audio.service
systemctl status send-metrics.service
journalctl -u process-audio.service -f
journalctl -u send-metrics.service -f
```

## 7. Cómo funciona la cola y la recuperación

- `index.json` contiene los archivos pendientes.
- La cola se procesa en orden lexicográfico, que coincide con el orden temporal si los nombres mantienen el formato de grabación.
- `MAX_BACKLOG` limita los archivos enviados por ciclo.
- Los errores temporales de red se reintentan hasta `MAX_RETRIES` y después quedan pausados en `failed_files.json`, sin borrarse.
- Los payloads inválidos se conservan para diagnóstico y no se reintentan automáticamente.
- Si se recibe `401`, se elimina la caché local del token y se solicita otro.
- `process_audio.py` y `send_metrics.py` bloquean conjuntamente `index.json` para evitar que una actualización sobrescriba la otra.

Para reactivar un archivo después de corregir el problema, revisar primero los logs y eliminar únicamente su entrada de `runtime/failed_files.json`. Si se elimina el archivo completo, se reactivarán todos los archivos pausados.

## 8. Dependencias

| Dependencia | Uso |
|---|---|
| `numpy` | RMS, dBFS y cálculos numéricos |
| `soundfile` | Lectura de WAV |
| `librosa` | STFT y métricas espectrales |
| `scipy` | Filtro de ponderación A |
| `watchdog` | Detección de nuevos archivos |
| `httpx` | Solicitudes HTTP al servidor |
| `python-dotenv` | Lectura de `.env` |

## 9. Solución rápida de problemas

| Síntoma | Comprobación |
|---|---|
| No se generan métricas | Revisar `process_audio.log`, la carpeta de WAV y los permisos de salida |
| `index.json` vacío | Verificar que existan WAV y que `--output` coincida con `METRICS_OUTPUT_DIR` |
| No conecta al servidor | Revisar `SERVER_URL`, red local y `systemctl status send-metrics` |
| Error `401` | Confirmar estación activa, `STATION_CODE` y `STATION_SECRET` |
| Archivos en `failed_files.json` | Revisar `runtime/send_metrics.log` antes de reactivar los archivos |
| VS Code no encuentra paquetes | Seleccionar `audio_env/bin/python` como intérprete |
