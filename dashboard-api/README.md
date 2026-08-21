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
| `GET` | `/compare/measurements` | Comparación con buckets temporales comunes (carga inicial) |
| `GET` | `/compare/measurements/raw` | Puntos exactos para ScatterChart, cargados bajo demanda |
| `GET` | `/system/stats` | Panel de resumen (cards) |
| `GET` | `/health` | Health check |

---

## Parámetros comunes

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `from` | datetime ISO | últimas 24h | Inicio del rango |
| `to` | datetime ISO | ahora | Fin del rango |
| `limit` | int | 1500 | Máximo de puntos visuales en `/measurements`, `/binaural` y `/spectral`; si se supera, el backend agrupa el rango completo en ventanas estadísticas |
| `metric` | string | `leq_dbfs` | Métrica a graficar (en `/measurements`) |
| `cursor` | datetime ISO | — | Cursor temporal para paginar `/measurements/raw` |
| `stations` | string | todas activas | Códigos separados por coma (en `/compare/measurements` y `/compare/measurements/raw`) |
| `max_points` | int | 1500 | Máximo de buckets comunes (en `/compare/measurements`) |
| `raw_limit` | int | 10000 | Máximo de puntos exactos por estación (en `/compare/measurements/raw`) |

---

## Métricas disponibles en `/measurements`

`leq_dbfs`, `dbfs_level`, `rms_energy`, `ch_left_dbfs`, `ch_right_dbfs`, `ild_db`, `interaural_correlation`, `dominant_frequency`, `spectral_centroid`, `spectral_rolloff`, `zero_crossing_rate`

## Métricas disponibles en `/compare`

`leq_hour`, `l10`, `l50`, `l90`, `dbfs_avg`, `dbfs_max`, `avg_spectral_centroid`, `avg_ild_db`, `avg_interaural_corr`

## Resolución y paginación

Las respuestas de series visuales incluyen `total_count`, `returned_count`, `is_aggregated` y `resolution_seconds`. Cuando el rango supera el máximo visual, se conserva todo el intervalo y cada punto representa una ventana con promedio, mínimo, máximo y `source_count`.

`/stations/{code}/measurements/raw` devuelve mediciones exactas por páginas. Usa `limit` (máximo 5000) y el `next_cursor` de la respuesta para solicitar la página siguiente. La descarga completa debe recorrer las páginas hasta que `has_more` sea `false`.

`/compare/measurements` devuelve únicamente `data`, con los mismos buckets temporales para todas las estaciones y sus estadísticas (`value`, `value_min`, `value_max`, `source_count`). Esto permite que la gráfica de líneas aparezca sin esperar al ScatterChart.

`/compare/measurements/raw` devuelve `raw_data` con timestamps originales para el ScatterChart. Cuando el rango supera `raw_limit`, el backend selecciona puntos exactos distribuidos temporalmente mediante `NTILE`, no valores interpolados. `raw_has_more` indica que existen más mediciones y `raw_sampled` que la respuesta es una muestra representativa. El frontend puede solicitar el límite máximo explícitamente.

Las agregaciones horarias incluyen también promedios espectrales y binaurales para permitir vistas históricas sin transportar todas las mediciones crudas.

---

## Configuración

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Destino PostgreSQL de `noise_analytics` |
| `DB_USERNAME` | Rol fijo de solo lectura `dashboard_reader` |
| `DB_PASSWORD` | Contraseña exclusiva del lector |
| `DB_URL` | Alternativa para desarrollo; reemplaza las variables anteriores |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | Conexiones persistentes y adicionales máximas (5 + 5) |
| `DB_POOL_TIMEOUT_SECONDS` | Espera máxima por una conexión libre (default: 3s) |
| `DB_STATEMENT_TIMEOUT_MS` | Tiempo máximo de una consulta PostgreSQL (default: 5000ms) |
| `CORS_ALLOWED_ORIGIN` | Origen web exacto autorizado |
| `PUBLIC_CACHE_SECONDS` | Caché del navegador para respuestas públicas (default: 30s) |
| `PORT` | Puerto del servicio (default: 8083) |

## Límites de consultas públicas

- Intervalo máximo: 31 días; el final no puede estar más de 5 minutos en el futuro.
- Comparaciones: máximo 25 estaciones; las mediciones adaptativas entregan
  como máximo 12.000 puntos totales y las series horarias quedan acotadas por
  las 25 estaciones y los 31 días.
- Detalle crudo comparativo: máximo 10.000 puntos repartidos entre las estaciones.
- Paginación cruda por estación: máximo 1.000 registros por solicitud.
- Códigos de estación: máximo 50 caracteres y solo letras, números, `_` o `-`.
- PostgreSQL cancela consultas que superan el timeout y el pool admite como
  máximo `DB_POOL_SIZE + DB_MAX_OVERFLOW` conexiones por proceso.
- Errores de timeout o pool responden `503` con `Retry-After`, sin exponer el
  mensaje interno del controlador PostgreSQL.

Las métricas interpoladas en SQL proceden exclusivamente de listas permitidas;
los códigos, fechas y demás valores se envían como parámetros enlazados.

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
    DB_HOST: postgres-noise
    DB_PORT: 5432
    DB_NAME: ${POSTGRES_NOISE_DB}
    DB_USERNAME: dashboard_reader
    DB_PASSWORD: ${DASHBOARD_DB_PASSWORD}
    DB_STATEMENT_TIMEOUT_MS: 5000
    CORS_ALLOWED_ORIGIN: ${CORS_ALLOWED_ORIGIN}
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
