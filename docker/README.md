# Docker — Sistema de Monitoreo Acústico Binaural

Orquestación completa del sistema con Docker Compose.

---

## Estructura esperada del proyecto

Para que Docker Compose encuentre todos los servicios, la estructura de carpetas debe ser:

```
proyecto/
├── docker/                          ← esta carpeta
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── .env                         ← crear desde .env.example
│   └── nginx/
│       └── nginx.conf
├── auth-service/                    ← backend autenticación (Spring Boot)
├── noise-processing-backend/        ← backend procesamiento (Spring Boot)
├── ingestion-api/                   ← backend ingesta (FastAPI)
├── schema_noise_analytics.sql       ← schema de noise_analytics
└── schema_station_registry.sql      ← schema de station_registry
```

---

## Setup paso a paso

### 1. Requisitos previos

```
Docker Desktop (Windows/Mac) o Docker Engine + Docker Compose (Linux)
```

Verificar que Docker esté corriendo:
```bash
docker --version
docker compose version
```

### 2. Configurar variables de entorno

```bash
cd docker
cp .env.example .env
```

Editar `.env` y reemplazar todos los valores `change_this_*`:

```bash
# Generar JWT_SECRET seguro
openssl rand -base64 32
```

El `.env` mínimo que debes completar:

| Variable | Descripción |
|---|---|
| `POSTGRES_NOISE_PASSWORD` | Contraseña de la BD de métricas |
| `POSTGRES_AUTH_PASSWORD` | Contraseña de la BD de autenticación |
| `JWT_SECRET` | Clave para firmar tokens JWT (mínimo 32 chars) |
| `ADMIN_API_KEY` | Clave para endpoints `/admin/*` |

### 3. Construir e iniciar todos los servicios

Desde la carpeta `docker/`:

```bash
docker compose up --build
```

La primera vez descarga imágenes base y compila los backends de Spring Boot. Puede tardar **5-10 minutos**. Las siguientes veces es mucho más rápido gracias al cache de Docker.

Para correr en segundo plano:
```bash
docker compose up --build -d
```

### 4. Verificar que todo está corriendo

```bash
docker compose ps
```

Deberías ver todos los servicios con estado `running` o `healthy`:

```
NAME               STATUS
postgres-noise     running (healthy)
postgres-auth      running (healthy)
auth-service       running
noise-processing   running
ingestion-api      running
nginx              running
```

### 5. Verificar health checks

```bash
# Nginx
curl http://localhost/health

# Auth Service (a través de Nginx)
curl http://localhost/auth/health

# Noise Processing (a través de Nginx)
curl http://localhost/processing/health

# Ingestion API (a través de Nginx)
curl http://localhost/ingest/health
```

Todos deben devolver `{"status": "ok", ...}`.

---

## Registro de una estación nueva

Cada estación nueva requiere dos llamadas al administrador, en este orden:

### Paso 1 — Registrar en Auth Service

```bash
curl -X POST http://localhost/admin/auth/stations \
  -H "X-Admin-Key: tu_admin_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "stationCode": "ST-CHAPINERO-01",
    "name": "Estación Chapinero",
    "locality": "Chapinero"
  }'
```

Respuesta — **guarda el `secret`, no se puede recuperar después**:
```json
{
  "stationCode": "ST-CHAPINERO-01",
  "name": "Estación Chapinero",
  "locality": "Chapinero",
  "secret": "abc123def456..."
}
```

### Paso 2 — Registrar en Noise Processing

```bash
curl -X POST http://localhost/admin/processing/stations \
  -H "X-Admin-Key: tu_admin_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "stationCode": "ST-CHAPINERO-01",
    "name": "Estación Chapinero",
    "locality": "Chapinero",
    "latitude": 4.6486,
    "longitude": -74.1057
  }'
```

### Paso 3 — Configurar la Raspberry Pi

En la Raspberry Pi, copiar el `secret` del Paso 1 al `.env` de la estación (aún por definir cuando se desarrolle el módulo de envío de datos).

---

## Comandos útiles

```bash
# Ver logs de todos los servicios
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f auth-service
docker compose logs -f noise-processing
docker compose logs -f ingestion-api

# Reiniciar un servicio sin reconstruir
docker compose restart auth-service

# Reconstruir y reiniciar un servicio específico
docker compose up --build auth-service

# Detener todos los servicios (datos se conservan en volúmenes)
docker compose down

# Detener y eliminar volúmenes (BORRA todos los datos de la BD)
docker compose down -v
```

---

## Rutas del sistema (a través de Nginx en puerto 80)

| Ruta | Servicio destino | Descripción |
|---|---|---|
| `POST /ingest/ingest` | Ingestion API | Métricas desde estaciones |
| `GET /ingest/health` | Ingestion API | Health check |
| `POST /auth/token` | Auth Service | Solicitar JWT |
| `POST /auth/validate` | Auth Service | Validar JWT |
| `GET /auth/health` | Auth Service | Health check |
| `POST /admin/auth/stations` | Auth Service | Registrar estación |
| `DELETE /admin/auth/stations/{code}/token` | Auth Service | Revocar token |
| `POST /processing/measurements` | Noise Processing | Interno (Ingestion API) |
| `GET /processing/health` | Noise Processing | Health check |
| `POST /admin/processing/stations` | Noise Processing | Registrar estación |

---

## Puertos expuestos al host

| Puerto | Servicio | Uso |
|---|---|---|
| `80` | Nginx | Punto de entrada principal |
| `5433` | postgres-noise | Acceso directo a BD métricas (desarrollo) |
| `5434` | postgres-auth | Acceso directo a BD autenticación (desarrollo) |

---

## Diagrama de red interna

```
Host (tu máquina)
  │
  └── puerto 80 ──► nginx
                      ├── /auth/*           ──► auth-service:8081
                      ├── /admin/auth/*     ──► auth-service:8081
                      ├── /processing/*     ──► noise-processing:8082
                      ├── /admin/processing/──► noise-processing:8082
                      └── /ingest/*         ──► ingestion-api:8000
                                                     │
                                               llama a nginx para
                                               validar tokens y
                                               reenviar métricas
```

---

## Solución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `auth-service` no arranca | `postgres-auth` aún no está `healthy` | Esperar 30s y revisar `docker compose logs postgres-auth` |
| Error `JWT_SECRET` muy corta | Secret menor de 32 caracteres | Generar con `openssl rand -base64 32` |
| `noise-processing` devuelve 404 al ingestar | Estación no registrada en noise_analytics | Ejecutar Paso 2 del registro de estación |
| Puerto 80 ocupado | Otro servicio usa el puerto 80 | Cambiar `NGINX_PORT=8080` en `.env` |
| Schemas no se aplican | Los `.sql` no están en la ruta esperada | Verificar que `schema_*.sql` están en la raíz del proyecto |
