# Sound Monitoring System

Sistema de Monitoreo Acustico Binaural para Bogota D.C.

Captura metricas de ruido ambiental desde estaciones distribuidas (Raspberry Pi con microfono estereo), las transmite a un servidor central donde son validadas, almacenadas y agregadas, y las presenta en un dashboard web interactivo con mapas y graficas.

---

## Arquitectura general

```
Raspberry Pi (estacion de campo)
    │  process_audio.py  →  archivos .txt con metricas JSON
    │  send_metrics.py   →  envio HTTPS al dominio publico
    ▼
Nginx + Certbot de la VPS (puertos 80/443, TLS y HSTS)
    └── 127.0.0.1:8080 → Gateway Nginx de Docker
            ├── /auth/*             → Auth Service (Spring Boot, puerto 8081)
            ├── /ingest/*           → Ingestion API (FastAPI, puerto 8000)
            ├── /processing/admin/* → Noise Processing Backend (puerto 8082)
            └── /dashboard/*        → Dashboard API (FastAPI, puerto 8083)

Dashboard Frontend (React, puerto 3000)
    └── consulta Dashboard API para graficas y mapa

PostgreSQL — dos bases de datos aisladas
    ├── station_registry   →  credenciales y tokens JWT
    └── noise_analytics    →  mediciones acusticas y agregaciones
```

---

## Componentes

### auth-service
Servicio de autenticacion de estaciones. Desarrollado con Spring Boot.

- Registra estaciones y genera un secret aleatorio (hash BCrypt).
- Emite tokens JWT cuando una estacion presenta su secret.
- Valida tokens a peticion de la Ingestion API.
- Expone endpoints de administracion protegidos con JWT y roles.
- Persiste en la base de datos `station_registry`.

Referencia: [auth-service/README.md](auth-service/README.md)

---

### ingestion-api
Capa de ingesta de metricas. Desarrollada con FastAPI (Python).

- Recibe el JSON de metricas enviado por cada estacion.
- Valida el formato con modelos Pydantic.
- Verifica el token JWT llamando al Auth Service.
- Reenvía las metricas al Noise Processing Backend.

Referencia: [ingestion-api/README.md](ingestion-api/README.md)

---

### noise-processing-backend
Servicio de procesamiento y persistencia acustica. Desarrollado con Spring Boot.

- Recibe las metricas validadas de la Ingestion API.
- Persiste cada fragmento en `acoustic_measurements`.
- Calcula y actualiza agregaciones horarias (Leq, L10, L50, L90) en `hourly_aggregations`.
- Detecta y descarta duplicados.
- Expone endpoints de administracion para registrar estaciones en `noise_analytics`.

Referencia: [noise-processing-backend/README.md](noise-processing-backend/README.md)

---

### dashboard-api
API de consulta para el dashboard. Desarrollada con FastAPI (Python).

- Solo lectura. Se conecta a `noise_analytics`.
- Expone endpoints de series temporales, agregaciones horarias, perfil diario, comparacion entre estaciones, metricas binaurales y espectrales.
- Optimizada para alimentar los componentes Recharts y el mapa Leaflet del frontend.

Referencia: [dashboard-api/README.md](dashboard-api/README.md)

---

### dashboard-frontend
Interfaz web. Desarrollada con React 18 + Vite + Tailwind CSS.

- Panel principal con cards de resumen y mapa de Bogota (Leaflet).
- Pagina de detalle de estacion con graficas de nivel, bandas, perfil diario, binaurales y espectrales.
- Pagina de comparacion entre estaciones.
- Portal de datos abiertos con descarga CSV.

Referencia: [dashboard-frontend/README.md](dashboard-frontend/README.md)

---

### send_metrics
Script Python que corre en cada Raspberry Pi.

- Detecta los archivos de metricas generados por `process_audio.py`.
- Solicita y renueva el token JWT automaticamente.
- Envia los archivos a la Ingestion API en ciclos configurables.
- Gestiona backlog, reintentos y registro de archivos enviados.
- Se puede configurar como servicio systemd para arranque automatico.

Referencia: [send_metrics/README.md](send_metrics/README.md)

---

### docker
Orquestacion completa del sistema con Docker Compose.

- Define todos los servicios: dos instancias de PostgreSQL, Auth Service, Noise Processing Backend, Ingestion API, Dashboard API, Dashboard Frontend y Nginx.
- Los schemas SQL se aplican automaticamente en el primer arranque.
- Nginx actua como punto de entrada unico en el puerto 80.

Referencia: [docker/README.md](docker/README.md)

---

### api-testing
Colecciones Postman para pruebas manuales de los endpoints.

- `monitoreo_acustico.postman_collection.json` — Ingestion API y Auth Service.
- `dashboard_api.postman_collection.json` — Dashboard API.

---

## Bases de datos

### station_registry
Gestionada exclusivamente por el Auth Service.

| Tabla | Descripcion |
|---|---|
| `registered_stations` | Estaciones autorizadas con hash del secret (BCrypt) |
| `api_tokens` | Tokens JWT emitidos, con soporte de revocacion individual |
| `auth_audit_log` | Registro inmutable de todos los eventos de autenticacion |

Schema: [schema_station_registry.sql](schema_station_registry.sql)

### noise_analytics
Gestionada por el Noise Processing Backend. Consultada por el Dashboard API.

| Tabla | Descripcion |
|---|---|
| `stations` | Metadatos y ubicacion geografica de cada estacion |
| `acoustic_measurements` | Metricas crudas por fragmento de audio (~2 minutos cada una) |
| `hourly_aggregations` | Leq, L10, L50, L90 y estadisticas calculadas por hora y estacion |

Schema: [schema_noise_analytics.sql](schema_noise_analytics.sql)

---

## Metricas acusticas capturadas

| Metrica | Descripcion |
|---|---|
| `leq_dbfs` | Nivel equivalente continuo con ponderacion A (IEC 61672) |
| `dbfs_level` | Nivel RMS global en dBFS |
| `rms_energy` | Energia RMS lineal [0.0 - 1.0] |
| `ch_left_dbfs` / `ch_right_dbfs` | Nivel dBFS por canal |
| `ild_db` | Diferencia de nivel interaural (izquierdo - derecho) |
| `interaural_correlation` | Correlacion entre canales (+1.0 = campo difuso, ~0 = fuente lateral) |
| `dominant_frequency` | Frecuencia dominante estimada via STFT (Hz) |
| `spectral_centroid` | Centro de masa espectral (Hz) |
| `spectral_rolloff` | Frecuencia que acumula el 85% de la energia espectral (Hz) |
| `zero_crossing_rate` | Tasa de cruces por cero |

---

## Tecnologias

| Componente | Tecnologia principal |
|---|---|
| auth-service | Java 21, Spring Boot 3, Spring Security, PostgreSQL, JWT |
| noise-processing-backend | Java 21, Spring Boot 3, Spring Data JPA, PostgreSQL |
| ingestion-api | Python 3.11, FastAPI, Pydantic, httpx |
| dashboard-api | Python 3.11, FastAPI, SQLAlchemy (async), asyncpg |
| dashboard-frontend | React 18, Vite 5, Tailwind CSS 3, Recharts, Leaflet |
| send_metrics | Python 3.9+, requests |
| Infraestructura | Docker, Docker Compose, Nginx, PostgreSQL 16 |

---

## Requisitos previos

- Docker Engine y Docker Compose (o Docker Desktop)
- Red local con IP estatica en el servidor (para la comunicacion con las Raspberry Pi)
- Raspberry Pi con microfono estereo y Python 3.9+ (para las estaciones de campo)

---

## Despliegue rapido

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd Sound-Monitoring-System
```

### 2. Configurar variables de entorno

```bash
cd docker
cp .env.example .env
```

Editar `.env` y completar al menos:

| Variable | Descripcion |
|---|---|
| `POSTGRES_NOISE_PASSWORD` | Contrasena de la BD de metricas |
| `POSTGRES_AUTH_PASSWORD` | Contrasena de la BD de autenticacion |
| `JWT_SECRET` | Clave JWT (minimo 32 caracteres, generar con `openssl rand -base64 32`) |
| `ADMIN_API_KEY` | Clave para los endpoints `/admin/*` |
| `SERVER_IP` | IP del servidor en la red local |

### 3. Levantar todos los servicios

```bash
docker compose up --build -d
```

La primera vez puede tardar entre 5 y 10 minutos mientras se descargan las imagenes base y se compilan los backends Java.

### 4. Verificar el estado

```bash
docker compose ps
curl http://localhost/auth/health
curl http://localhost/ingest/health
curl http://localhost/processing/health
```

### 5. Registrar una estacion nueva

Paso 1 — Registrar en el Auth Service (obtener el secret):

```bash
curl -X POST http://localhost/admin/auth/stations \
  -H "X-Admin-Key: <ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "stationCode": "ST-CHAPINERO-01",
    "name": "Estacion Chapinero",
    "locality": "Chapinero"
  }'
```

Guardar el campo `secret` de la respuesta. No se puede recuperar despues.

Paso 2 — Registrar en el Noise Processing Backend (datos geograficos):

```bash
curl -X POST http://localhost/admin/processing/stations \
  -H "X-Admin-Key: <ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "stationCode": "ST-CHAPINERO-01",
    "name": "Estacion Chapinero",
    "locality": "Chapinero",
    "latitude": 4.6486,
    "longitude": -74.1057
  }'
```

Paso 3 — Configurar la Raspberry Pi con el secret del Paso 1 en el `.env` de `send_metrics`.

---

## Estructura del repositorio

```
Sound-Monitoring-System/
├── auth-service/                  # Autenticacion y emision de tokens JWT (Spring Boot)
├── ingestion-api/                 # Recepcion y validacion de metricas (FastAPI)
├── noise-processing-backend/      # Procesamiento y persistencia acustica (Spring Boot)
├── dashboard-api/                 # API de consulta para el dashboard (FastAPI)
├── dashboard-frontend/            # Interfaz web (React + Vite)
├── send_metrics/                  # Cliente de envio para Raspberry Pi (Python)
├── docker/                        # Docker Compose, Nginx y variables de entorno
├── api-testing/                   # Colecciones Postman
├── schema_noise_analytics.sql     # Schema de la BD de metricas
└── schema_station_registry.sql    # Schema de la BD de autenticacion
```

---

## Flujo completo de datos

```
1. process_audio.py (Raspberry Pi)
      Graba fragmentos de ~2 minutos, calcula metricas acusticas,
      guarda el resultado como archivo .txt en formato JSON.

2. send_metrics.py (Raspberry Pi)
      Detecta archivos nuevos, solicita o renueva el token JWT,
      envía cada archivo a POST /ingest/ingest.

3. Ingestion API
      Valida el formato JSON (Pydantic) y el token JWT (Auth Service),
      reenvía las metricas al Noise Processing Backend.

4. Noise Processing Backend
      Persiste la medicion en acoustic_measurements,
      recalcula la agregacion horaria en hourly_aggregations.

5. Dashboard API
      Expone los datos de noise_analytics para el frontend.

6. Dashboard Frontend
      Muestra el mapa de estaciones, graficas de niveles,
      bandas percentilicas, metricas binaurales y espectrales.
```
