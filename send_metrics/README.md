# send_metrics — Módulo de envío de métricas acústicas

Envía los archivos JSON generados por `process_audio.py` al sistema central de monitoreo acústico.

Corre en la Raspberry Pi en paralelo con `process_audio.py`.

---

## Archivos

| Archivo | Descripción |
|---|---|
| `send_metrics.py` | Script principal |
| `.env.example` | Plantilla de variables de entorno |
| `token.json` | Token JWT activo (generado automáticamente, no commitear) |
| `sent_files.json` | Registro de archivos ya enviados (generado automáticamente) |
| `failed_files.json` | Registro de archivos fallidos (generado automáticamente) |
| `send_metrics.log` | Log de operaciones |

---

## Requisitos

- Python 3.9+
- Entorno virtual con las dependencias instaladas
- La estación debe estar registrada en el Auth Service y en el Noise Processing Backend
- El PC servidor debe estar encendido y accesible en la red local

---

## Instalación

```bash
# En la misma carpeta del script
python3 -m venv venv
source venv/bin/activate          # Linux / Raspberry Pi
# venv\Scripts\activate.bat       # Windows

pip install -r requirements.txt
```

---

## Configuración

```bash
cp .env.example .env
```

Editar `.env` con los valores reales:

| Variable | Descripción |
|---|---|
| `STATION_CODE` | Código de esta estación (ej: `ST-CHAPINERO-01`) |
| `STATION_SECRET` | Secret obtenido al registrar la estación en el Auth Service |
| `SERVER_URL` | IP del PC servidor (ej: `http://192.168.1.100`) |
| `METRICS_OUTPUT_DIR` | Carpeta donde `process_audio.py` guarda los `.txt` |
| `SEND_INTERVAL_SECONDS` | Segundos entre ciclos (default: `30`) |
| `MAX_RETRIES` | Intentos máximos por archivo antes de descartar (default: `3`) |
| `MAX_BACKLOG` | Máximo de archivos a enviar por ciclo (default: `100`) |

**Encontrar la IP del servidor:**
```bash
# En el PC servidor (Linux)
ip addr show | grep "inet "

# En el PC servidor (Windows)
ipconfig
```

---

## Uso

**Modo continuo** (operación normal en la Raspberry Pi):
```bash
python send_metrics.py
```

**Modo único** (un ciclo y termina, útil para pruebas):
```bash
python send_metrics.py --once
```

**Ver estado** (cuántos archivos hay pendientes sin enviar nada):
```bash
python send_metrics.py --status
```

---

## Flujo de operación

```
Arranque
  │
  ├── Validar variables de entorno
  ├── Cargar/solicitar token JWT
  │
  └── Ciclo continuo:
        ├── Leer index.json (lista de archivos disponibles)
        ├── Calcular pendientes (index - ya_enviados)
        ├── Por cada pendiente:
        │     ├── Verificar token (renovar si está por vencer)
        │     ├── Leer .txt y enviar a la Ingestion API
        │     ├── Si 201/200 → marcar como enviado
        │     └── Si error → incrementar contador de reintentos
        └── Esperar SEND_INTERVAL_SECONDS
```

---

## Gestión del token JWT

El token se almacena en `token.json` y se renueva automáticamente cuando queda menos de 1 día de vigencia. Si el servidor rechaza el token con HTTP 401, el módulo elimina `token.json` y solicita uno nuevo en el siguiente ciclo.

No es necesario gestionar el token manualmente.

---

## Archivos acumulados (backlog)

Si la Raspberry Pi estuvo apagada varios días, puede haber muchos archivos pendientes. Al arrancar, el módulo los envía en orden cronológico hasta el límite de `MAX_BACKLOG` por ciclo. Los archivos restantes se envían en ciclos posteriores.

---

## Ejecutar automáticamente al arrancar la Raspberry Pi

Para que el módulo arranque automáticamente con la Raspberry Pi, agregar una línea al `crontab`:

```bash
crontab -e
```

Agregar al final:
```
@reboot cd /ruta/a/send_metrics && source venv/bin/activate && python send_metrics.py >> send_metrics.log 2>&1 &
```

O usando systemd (más robusto):

```ini
# /etc/systemd/system/send-metrics.service
[Unit]
Description=Send Metrics — Monitoreo Acústico
After=network.target

[Service]
WorkingDirectory=/ruta/a/send_metrics
ExecStart=/ruta/a/send_metrics/venv/bin/python send_metrics.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable send-metrics
sudo systemctl start send-metrics
```

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `STATION_CODE no definido` | Falta el `.env` | `cp .env.example .env` y completar |
| `No se pudo conectar al servidor` | PC servidor apagado o IP incorrecta | Verificar que el servidor esté encendido y `SERVER_URL` sea correcta |
| Token rechazado (401) | Secret incorrecto o estación no registrada | Verificar `STATION_SECRET` en el `.env` |
| Archivo en `failed_files.json` | Envío fallido 3 veces | Revisar logs para ver el error específico. Borrar `failed_files.json` para reintentar |
| `index.json vacío` | `process_audio.py` no ha procesado archivos aún | Verificar que `METRICS_OUTPUT_DIR` apunte a la carpeta correcta |
