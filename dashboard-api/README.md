# Dashboard Backend API

API de consulta de datos acústicos para el dashboard de visualización del Sistema de Monitoreo Acústico Binaural.

Solo lectura. Se conecta a `noise_analytics` y expone los datos optimizados para gráficas Recharts y mapa Leaflet.

---

## Estructura

```
dashboard-api/
├── app/
│   ├── main.py          # Punto de entrada, CORS
│   ├── config.py        # Variables de entorno
│   ├── database.py      # Conexión async SQLAlchemy
│   ├── routers/
│   │   ├── stations.py      # Mapa y resumen de estaciones
│   │   ├── measurements.py  # Serie temporal cruda
│   │   ├── aggregations.py  # Leq/L10/L50/L90 por hora y perfil diario
│   │   ├── compare.py       # Comparación entre estaciones
│   │   ├── binaural.py      # ILD y correlación interaural
│   │   ├── spectral.py      # Centroide, rolloff, frecuencia dominante
│   │   └── system.py        # Estadísticas globales del sistema
│   └── schemas/             # Modelos Pydantic de respuesta
```

---

## Endpoints

| Método | Ruta | Alimenta |
|---|---|---|
| `GET` | `/stations` | Mapa de Bogotá (marcadores con color por nivel) |
| `GET` | `/stations/{code}/summary` | Tarjeta de detalle de estación |
| `GET` | `/stations/{code}/measurements` | Gráfica de línea (serie temporal cruda) |
| `GET` | `/stations/{code}/hourly` | Gráfica de banda L10/L50/L90 |
| `GET` | `/stations/{code}/daily-profile` | Gráfica de barras 24 horas |
| `GET` | `/stations/{code}/binaural` | Gráfica ILD y correlación interaural |
| `GET` | `/stations/{code}/spectral` | Gráficas de centroide y frecuencia dominante |
| `GET` | `/compare` | Gráfica de líneas múltiples entre estaciones |
| `GET` | `/system/stats` | Panel de resumen (cards) |
| `GET` | `/health` | Health check |

---

## Parámetros comunes

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `from` | datetime ISO | últimas 24h | Inicio del rango |
| `to` | datetime ISO | ahora | Fin del rango |
| `limit` | int (1-5000) | 500 | Máximo de puntos devueltos |
| `metric` | string | `leq_dbfs` | Métrica a graficar (en `/measurements`) |

---

## Métricas disponibles en `/measurements`

`leq_dbfs`, `dbfs_level`, `rms_energy`, `ch_left_dbfs`, `ch_right_dbfs`, `ild_db`, `interaural_correlation`, `dominant_frequency`, `spectral_centroid`, `spectral_rolloff`, `zero_crossing_rate`

## Métricas disponibles en `/compare`

`leq_hour`, `l10`, `l50`, `l90`, `dbfs_avg`, `dbfs_max`, `avg_spectral_centroid`, `avg_ild_db`, `avg_interaural_corr`

---

## Configuración

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `DB_URL` | URL asyncpg de `noise_analytics` |
| `PORT` | Puerto del servicio (default: 8083) |

---

## Ejecución local

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # editar con los valores reales

uvicorn app.main:app --reload --port 8083
```

Documentación interactiva en: `http://localhost:8083/docs`

---

## Docker

```bash
docker build -t dashboard-api .
docker run -p 8083:8083 --env-file .env dashboard-api
```

---

## Integración con Docker Compose

Agregar en `docker/docker-compose.yml`:

```yaml
dashboard-api:
  build:
    context: ../dashboard-api
    dockerfile: Dockerfile
  container_name: dashboard-api
  environment:
    DB_URL: postgresql+asyncpg://${POSTGRES_NOISE_USER}:${POSTGRES_NOISE_PASSWORD}@postgres-noise:5432/${POSTGRES_NOISE_DB}
    PORT: 8083
  depends_on:
    postgres-noise:
      condition: service_healthy
  restart: unless-stopped
```

Y en `nginx/nginx.conf` agregar:

```nginx
upstream dashboard_api {
    server dashboard-api:8083;
}

location /dashboard/ {
    proxy_pass http://dashboard_api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```
