# Noise Processing Backend

Servicio de procesamiento acústico del Sistema de Monitoreo Acústico Binaural.

Recibe las métricas validadas de la Ingestion API, las persiste en `acoustic_measurements` y calcula las agregaciones horarias (Leq, L10, L50, L90) en `hourly_aggregations`.

---

## Estructura

```
noise-processing-backend/
├── src/main/java/com/monitoreo/processing/
│   ├── NoiseProcessingApplication.java
│   ├── config/
│   │   └── SecurityConfig.java
│   ├── controller/
│   │   └── MeasurementController.java   # POST /processing/measurements | POST /admin/stations | GET /health
│   ├── dto/
│   │   ├── MeasurementRequest.java
│   │   ├── RegisterStationRequest.java
│   │   └── RegisterStationResponse.java
│   ├── entity/
│   │   ├── Station.java                 # Tabla stations
│   │   ├── AcousticMeasurement.java     # Tabla acoustic_measurements
│   │   └── HourlyAggregation.java       # Tabla hourly_aggregations
│   ├── repository/
│   ├── service/
│   │   ├── MeasurementService.java      # Orquesta insert + duplicados + agregación
│   │   └── AggregationService.java      # Calcula Leq, L10, L50, L90
│   └── exception/
└── src/main/resources/
    └── application.properties
```

---

## Endpoints

| Método | Ruta | Descripción | Protección |
|---|---|---|---|
| `POST` | `/processing/measurements` | Recibe y persiste métricas acústicas | Pública (validada por Ingestion API) |
| `POST` | `/admin/stations` | Registra estación en noise_analytics | X-Admin-Key |
| `GET` | `/health` | Health check | Pública |

---

## Configuración

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `DB_URL` | URL JDBC de `noise_analytics` |
| `DB_USERNAME` | Usuario de PostgreSQL |
| `DB_PASSWORD` | Contraseña de PostgreSQL |
| `ADMIN_API_KEY` | Clave para `/admin/stations` |
| `PORT` | Puerto del servicio (default: 8082) |

---

## Ejecución local

```bash
# Compilar
mvn clean package -DskipTests

# Correr (Linux/Mac)
export $(cat .env | xargs) && java -jar target/noise-processing-backend-1.0.0.jar

# Correr (Windows CMD)
for /f "tokens=1,2 delims==" %a in (.env) do set %a=%b
java -jar target\noise-processing-backend-1.0.0.jar
```

---

## Docker

```bash
docker build -t noise-processing-backend .
docker run -p 8082:8082 --env-file .env noise-processing-backend
```

---

## Flujo de registro de una estación

El administrador debe registrar cada estación en DOS pasos independientes:

```
Paso 1 — Auth Service:
POST /admin/stations  →  http://auth-service:8081
Header: X-Admin-Key: <clave>
Body: { "stationCode": "ST-CHAPINERO-01", "name": "...", "locality": "..." }
← Guarda el secret devuelto para configurar la Raspberry Pi

Paso 2 — Noise Processing Backend:
POST /admin/stations  →  http://noise-processing-backend:8082
Header: X-Admin-Key: <clave>
Body: { "stationCode": "ST-CHAPINERO-01", "name": "...", "locality": "...",
        "latitude": 4.6486, "longitude": -74.1057 }
```

---

## Flujo de procesamiento de un fragmento

```
Ingestion API
  │  POST /processing/measurements
  │  { station_code, timestamp, dbfs_level, leq_dbfs, ... }
  ▼
Noise Processing Backend
  │  1. Busca station_id por station_code → 404 si no existe
  │  2. Verifica duplicado (station_id + recorded_at) → 200 si ya existe
  │  3. INSERT en acoustic_measurements → 201
  │  4. Actualiza last_seen_at en stations
  │  5. Recalcula hourly_aggregations para esa hora
  ▼
PostgreSQL (noise_analytics)
```

---

## Lógica de agregaciones

Después de cada INSERT exitoso se recalcula la agregación de la hora correspondiente:

- **Leq horario**: promedio energético `10 * log10(mean(10^(leq_i/10)))`
- **L10**: percentil 90 de leq_dbfs → nivel superado el 10% del tiempo (picos)
- **L50**: percentil 50 de leq_dbfs → nivel típico (mediana)
- **L90**: percentil 10 de leq_dbfs → nivel superado el 90% del tiempo (fondo)
- **Estadísticas de dbfs_level**: min, max, promedio, desviación estándar
- **Promedios espectrales y binaurales**: centroid, rolloff, ZCR, ILD, correlación interaural

---

## Códigos de respuesta

| Código | Situación |
|---|---|
| `201 Created` | Métricas insertadas y agregación actualizada |
| `200 OK` | Fragmento duplicado ignorado |
| `404 Not Found` | station_code no existe en noise_analytics |
| `409 Conflict` | Estación ya registrada (admin) |
| `403 Forbidden` | X-Admin-Key inválida |
