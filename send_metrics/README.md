# Estación de monitoreo acústico

Esta carpeta contiene los programas que se ejecutan en cada Raspberry Pi. La Raspberry procesa los archivos `.wav`, genera métricas acústicas y las envía al servidor central.

La topología completa, rutas públicas y despliegue del servidor se documentan
en el [README raíz](../README.md) y [docker/README.md](../docker/README.md).

## 1. Organización de la carpeta

La estructura esperada es:

```text
send_metrics/
├── README.md
├── .env.example              # Compatibilidad para desarrollo local
├── requirements.txt          # Dependencias Python y de la TUI
├── audio_env/                # Entorno virtual local; ignorado por Git
├── bin/sound-monitor         # Lanzador de la TUI
├── tui/app.py                # Interfaz de operación y configuración
├── recorder/                 # Grabador ALSA C++
├── scripts/
│   ├── process_audio.py      # Analiza los WAV
│   ├── send_metrics.py       # Envía las métricas
│   ├── station_config.py     # Configuración TOML compartida
│   └── runtime_status.py     # Estado atómico para la TUI
├── setup/
│   ├── install_station.sh    # Instalación completa en Raspberry Pi OS
│   ├── setup_env_linux.sh    # Entorno de desarrollo Linux
│   └── setup_env_windows.bat # Instalación para Windows
└── runtime/                  # Datos generados; ignorado por Git
    ├── audio_stats/          # JSON de métricas con extensión .txt
    ├── token.json            # JWT de la estación
    ├── failed_files.json     # Estado versionado de fallos
    ├── send_metrics.log
    └── audio_processing_log.log
```

`process_audio.py` y `send_metrics.py` deben usar la misma carpeta `runtime/audio_stats`. Los archivos `.txt` publicados son la fuente de verdad de la cola; `index.json` es un manifiesto que se reconstruye automáticamente si falta, se corrompe o la estación se apaga durante su actualización. Los archivos de `runtime/` son datos locales de la estación y no deben copiarse al repositorio ni compartirse públicamente.

## 2. Instalación en una Raspberry Pi

### 2.1 Copiar el proyecto

Copiar la carpeta `send_metrics` completa a la Raspberry, por ejemplo:

```bash
mkdir -p /home/pi/Sound-Monitoring-System
cp -r send_metrics /home/pi/Sound-Monitoring-System/
cd /home/pi/Sound-Monitoring-System/send_metrics
```

La ruta puede ser diferente, pero debe conservarse la estructura anterior.

### 2.2 Instalación completa

Conecte primero el dispositivo de captura. Desde la carpeta `send_metrics`, ejecute:

```bash
chmod +x setup/install_station.sh
./setup/install_station.sh
```

El instalador solicita privilegios una vez y realiza de forma idempotente:

- dependencias C++ y Python;
- entorno virtual, compilación e instalación del grabador;
- las tres unidades systemd y sus permisos restringidos;
- el comando global `sound-monitor`;
- autologin y apertura de la TUI en Raspberry Pi OS Desktop;
- el asistente de primera configuración.

El asistente pide código, secreto, URL del servidor y dispositivo ALSA. Valida el hardware y solicita un token antes de guardar. La estación debe existir previamente en Auth y Processing.

La configuración se guarda en `~/.config/sound-monitor/station.toml` con permisos `0600`. No incluirla en logs, issues, commits ni capturas de pantalla.

Al terminar, los tres servicios se habilitan para cada arranque. Reinicie la Raspberry para aplicar el autologin gráfico.

### 2.3 Abrir la TUI

```bash
sound-monitor
```

El comando funciona desde cualquier carpeta, consola local o sesión SSH. En el escritorio se abre automáticamente una terminal con la TUI al iniciar la sesión. Salir de la interfaz no detiene los servicios.

Desde la interfaz se puede revisar el progreso de grabación, análisis, cola, envío, disco y eventos; operar servicios; probar ALSA/servidor; reactivar fallidos y editar los parámetros avanzados.

### 2.4 Desarrollo sin instalar servicios

Para preparar solo el entorno Python del checkout:

```bash
./setup/setup_env_linux.sh
```

En este modo `.env` sigue siendo compatible. La instalación de estación usa el TOML compartido como fuente principal.

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

### 3.1 Grabador ALSA de terminal

El componente `recorder/` reemplaza la antigua aplicación JUCE. Captura WAV PCM de 24 bits, 44.100 Hz y hasta dos canales en segmentos de 60 segundos, y publica cada archivo cerrado en la carpeta de grabaciones.

La fuente no se selecciona automáticamente: el asistente de `sound-monitor` enumera ALSA, permite elegir el dispositivo y lo valida antes de activar el servicio. La guía del binario se encuentra en [`recorder/README.md`](recorder/README.md).

El grabador escribe primero `*.wav.part` y lo renombra a `.wav` al cerrar el segmento. Por tanto, `process_audio.py --watch` debe seguir apuntando a la misma carpeta, pero solo verá archivos completos.

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

El `.wav` se elimina únicamente después de publicar durablemente su métrica. Si
falla la escritura local se conserva para reintento; si el audio no puede
analizarse se mueve a `grabaciones/.failed/` para diagnóstico.

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

`process_audio.py` inicia la vigilancia antes del escaneo inicial, encola los
eventos sin bloquear `watchdog` y reconcilia el directorio periódicamente. Un
evento perdido o un WAV publicado durante el arranque se recupera sin reiniciar
el servicio. `send_metrics.py` consulta la cola cada 30 segundos por defecto.

## 6. Arranque automático con systemd

`setup/install_station.sh` genera e instala tres unidades a partir de las plantillas de `systemd/`:

- `continuous-recorder.service` captura y publica WAV completos;
- `process-audio.service` produce las métricas locales;
- `send-metrics.service` autentica y entrega la cola.

Los procesos están aislados para que un fallo de análisis o red no interrumpa la captura. La TUI solo los observa y opera; cerrarla no modifica su estado.

Comprobar estado y logs:

```bash
systemctl status continuous-recorder.service
systemctl status process-audio.service
systemctl status send-metrics.service
journalctl -u continuous-recorder.service -f
journalctl -u process-audio.service -f
journalctl -u send-metrics.service -f
```

La regla de `/etc/sudoers.d/sound-monitor` solo autoriza a la TUI a ejecutar `start`, `stop` y `restart` sobre esas tres unidades.

## 7. Cómo funciona la cola y la recuperación

- Los `.txt` publicados contienen los archivos pendientes; `index.json` es su índice reconstruible.
- El WAV solo se elimina después de publicar y sincronizar su `.txt`. Los WAV que no pueden analizarse se conservan en `grabaciones/.failed/` junto con el motivo; un fallo temporal al escribir la métrica conserva el WAV y lo reintenta con espera.
- Los eventos de archivos son avisos y no la fuente de verdad: el procesador vuelve a escanear los WAV finales cada 15 segundos y deduplica los detectados por ambas vías.
- La cola se procesa en orden lexicográfico, que coincide con el orden temporal si los nombres mantienen el formato de grabación.
- `MAX_BACKLOG` limita los archivos enviados por ciclo.
- Los errores temporales de red se conservan en la cola y se reintentan indefinidamente con backoff progresivo: comienza en 30 segundos y llega como máximo a 900 segundos. El ciclo se detiene en el primer fallo de transporte para no saturar la Raspberry ni el servidor.
- `MAX_RETRIES` ya no bloquea los errores temporales: es únicamente un umbral informativo para alertas y diagnóstico.
- `failed_files.json` usa el formato versionado `{"version": 2, "files": {...}}`. Los registros tienen `attempts`, `kind` (`temporary` o `permanent`), `last_error` y `updated_at`. El formato antiguo `{"archivo.txt": 3}` se migra y se considera temporal.
- Los errores permanentes (payload inválido, ruta o timestamp inválidos y rechazos definitivos HTTP) se conservan localmente y quedan pausados para diagnóstico. No se eliminan automáticamente.
- Cuando el servidor vuelve a estar accesible, el emisor retoma automáticamente el envío de todas las métricas temporales pendientes; no hace falta acudir físicamente a la estación.
- Los payloads inválidos se conservan para diagnóstico y no se reintentan automáticamente.
- El JWT se renueva preventivamente con `TOKEN_RENEWAL_MARGIN_SECONDS` (24 horas por defecto). Si Auth no responde, el token aún vigente sigue usándose y la renovación aplica backoff exponencial, respetando `Retry-After` cuando exista. `AUTH_RETRY_INITIAL_SECONDS` y `AUTH_RETRY_MAX_SECONDS` también controlan el backoff del transporte de métricas.
- Si se recibe `401`, se descarta la caché, se solicita un token nuevo y se reintenta esa misma métrica en el ciclo actual. Si Auth sigue caído, la estación conserva la cola y se recupera sola al volver el servicio.
- Para probar una expiración de dos minutos, configura temporalmente `TOKEN_RENEWAL_MARGIN_SECONDS=0` en la Raspberry y elimina su `runtime/token.json` antes de iniciar el emisor, para que no reutilice un JWT antiguo.
- `process_audio.py` y `send_metrics.py` bloquean conjuntamente `index.json` para evitar que una actualización sobrescriba la otra.
- Cuando existe `station.toml`, las variables heredadas del entorno no sustituyen sus valores. Esto impide que los servicios usen rutas diferentes accidentalmente; `.env` solo se consulta si no existe el TOML.
- Cada log rota al alcanzar `LOG_MAX_BYTES` (5 MiB por defecto) y conserva `LOG_BACKUP_COUNT` archivos históricos (5 por defecto). Con esos valores, cada script usa como máximo aproximadamente 30 MiB en logs locales.

Para reactivar archivos después de corregir el problema, use **Controles → Reactivar fallidos** en `sound-monitor`. Esta acción solo libera archivos pausados por errores permanentes; las métricas con fallos temporales no necesitan intervención manual. La TUI pausa brevemente el emisor, actualiza el registro bajo bloqueo y vuelve a iniciarlo.

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
| `tomli` | Lectura TOML en Python 3.9/3.10 |
| `Textual` / `Rich` | Interfaz de terminal |
| `pactl` (`pulseaudio-utils`) | Nombre y tipo de la fuente física detrás de PulseAudio/PipeWire |
| ALSA / libsndfile / toml++ | Captura C++ y configuración del grabador |

## 9. Solución rápida de problemas

| Síntoma | Comprobación |
|---|---|
| No se generan métricas | Revisar `runtime/audio_processing_log.log`, la carpeta de WAV y los permisos de salida |
| `index.json` vacío | Verificar que existan WAV y que `--output` coincida con `METRICS_OUTPUT_DIR` |
| No conecta al servidor | Revisar `SERVER_URL`, red local y `systemctl status send-metrics` |
| `pulse: Connection refused` al validar Bluetooth | Confirmar `systemctl --user status pipewire-pulse`, que exista `/run/user/$(id -u)/pulse/native` y volver a ejecutar el instalador actualizado |
| Error `401` | Confirmar estación activa, `STATION_CODE` y `STATION_SECRET` |
| Archivos permanentes en `failed_files.json` | Revisar `runtime/send_metrics.log` antes de reactivar los archivos |
| `sound-monitor` no existe | Reejecutar `setup/install_station.sh` |
| La TUI no controla servicios | Validar `/etc/sudoers.d/sound-monitor` y revisar `sudo -n -l` |
| No aparece al iniciar el escritorio | Confirmar autologin y `~/.config/autostart/sound-monitor.desktop` |
| VS Code no encuentra paquetes | Seleccionar `audio_env/bin/python` como intérprete |
