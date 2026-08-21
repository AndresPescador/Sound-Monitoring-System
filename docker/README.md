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
│   ├── VPS_DEPLOYMENT.md             ← HTTPS con Nginx/Certbot en la VPS
│   ├── SECURITY_ROTATION.md           ← rotación de admin y JWT
│   └── nginx/
│       ├── nginx.conf                ← gateway Docker interno
│       ├── vps-bootstrap.conf.example
│       └── vps-site.conf.example     ← proxy TLS del host
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

Editar `.env` y reemplazar todos los marcadores:

```bash
# Ejecutar dos veces y usar un resultado diferente para cada clave
openssl rand -base64 48
openssl rand -base64 48
```

El `.env` mínimo que debes completar:

| Variable | Descripción |
|---|---|
| `POSTGRES_NOISE_PASSWORD` | Contraseña de la BD de métricas |
| `POSTGRES_AUTH_PASSWORD` | Contraseña de la BD de autenticación |
| `STATION_JWT_SECRET` | Clave exclusiva para JWT de estaciones |
| `ADMIN_JWT_SECRET` | Clave distinta para JWT administrativos |
| `CORS_ALLOWED_ORIGIN` | Origen HTTPS exacto del frontend |

Las dos claves JWT deben contener al menos 32 bytes y ser diferentes. Auth
Service se niega a iniciar si falta alguna o si son iguales.

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

En una instalación nueva, crea el primer superadministrador con:

```bash
sudo apt install -y apache2-utils
bash ../sql/manage_super_admin.sh bootstrap
```

Para actualizar una instalación que utilizó la credencial o la clave JWT
anterior, sigue [SECURITY_ROTATION.md](SECURITY_ROTATION.md).

### 5. Verificar health checks

```bash
# Gateway Docker, accesible únicamente desde la propia VPS
curl http://127.0.0.1:8080/health

# Auth Service (a través de Nginx)
curl http://127.0.0.1:8080/auth/health

# Noise Processing (a través de Nginx)
curl http://127.0.0.1:8080/processing/health

# Ingestion API (a través de Nginx)
curl http://127.0.0.1:8080/ingest/health
```

Todos deben devolver `{"status": "ok", ...}`.

---

## Registro de una estación nueva

Cada estación nueva requiere dos llamadas al administrador, en este orden:

### Paso 1 — Registrar en Auth Service

```bash
curl -X POST https://soundmonitoring.systems/auth/admin/stations \
  -H "Authorization: Bearer <JWT_ADMIN>" \
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
curl -X POST https://soundmonitoring.systems/processing/admin/stations \
  -H "Authorization: Bearer <JWT_ADMIN>" \
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

## Rutas del sistema

En producción, Nginx + Certbot de la VPS recibe HTTPS y reenvía al gateway en
`127.0.0.1:8080`. Consulta [VPS_DEPLOYMENT.md](VPS_DEPLOYMENT.md).

| Ruta | Servicio destino | Descripción |
|---|---|---|
| `POST /ingest/ingest` | Ingestion API | Métricas desde estaciones |
| `GET /ingest/health` | Ingestion API | Health check |
| `POST /auth/token` | Auth Service | Solicitar JWT |
| `GET /auth/health` | Auth Service | Health check |
| `/auth/admin/*` | Auth Service | Login y administración con JWT |
| `/processing/admin/*` | Noise Processing | Administración con JWT |
| `GET /processing/health` | Noise Processing | Health check |
| `/dashboard/*` | Dashboard API | Consultas públicas |

Las siguientes rutas no se publican. Si se solicitan a Nginx devuelven `404`:

| Ruta interna | Consumidor autorizado |
|---|---|
| `POST /auth/validate` | Ingestion API por `service_internal` |
| `POST /admin/validate` | Noise Processing por `service_internal` |
| `POST /processing/measurements` | Ingestion API por `service_internal` |

---

## Puertos expuestos al host

| Escucha del host | Servicio | Exposición |
|---|---|---|
| `127.0.0.1:8080` | Gateway Docker | Solo loopback de la VPS |
| `0.0.0.0:80/443` | Nginx del host | Internet, HTTP→HTTPS y TLS |

PostgreSQL y los backends no publican puertos en el host.

---

## Diagrama de red interna

```
Internet ── HTTPS :443 ──► Nginx + Certbot de la VPS
                              │
                              └── 127.0.0.1:8080 ──► nginx Docker
                  ├── auth_gateway       ──► auth-service
                  ├── processing_gateway ──► noise-processing (solo admin/health)
                  ├── ingestion_gateway  ──► ingestion-api
                  ├── dashboard_gateway  ──► dashboard-api
                  └── frontend_gateway   ──► dashboard-frontend

ingestion-api ── service_internal ──► auth-service
              └─ service_internal ──► noise-processing

noise-processing ── service_internal ──► auth-service

auth-service       ── auth_data  ──► postgres-auth
noise-processing   ── noise_data ──► postgres-noise
dashboard-api      ── noise_data ──► postgres-noise
```

---

## Solución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `auth-service` no arranca | `postgres-auth` aún no está `healthy` | Esperar 30s y revisar `docker compose logs postgres-auth` |
| Error de claves JWT | Falta una clave, tiene menos de 32 bytes o ambas son iguales | Generar dos valores independientes con `openssl rand -base64 48` |
| `noise-processing` devuelve 404 al ingestar | Estación no registrada en noise_analytics | Ejecutar Paso 2 del registro de estación |
| `127.0.0.1:8080` ocupado | Otro proceso usa el puerto local | Cambiar `NGINX_PORT` y el `proxy_pass` del sitio VPS al mismo valor |
| Schemas no se aplican | Los `.sql` no están en la ruta esperada | Verificar que `schema_*.sql` están en la raíz del proyecto |
