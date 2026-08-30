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
| `POST` | `/processing/measurements` | Recibe y persiste métricas acústicas | Solo red interna |
| `POST` | `/admin/stations` | Registra estación en noise_analytics | JWT ADMIN/SUPER_ADMIN |
| `GET` | `/admin/stations` | Lista estaciones, incluidas las inactivas | JWT ADMIN/SUPER_ADMIN |
| `GET` | `/admin/stations/{code}` | Consulta el detalle administrativo de una estación | JWT ADMIN/SUPER_ADMIN |
| `PUT` | `/admin/stations/{code}` | Actualiza descripción, dirección y coordenadas | JWT ADMIN/SUPER_ADMIN |
| `PATCH` | `/admin/stations/{code}/status` | Activa o desactiva la estación en `noise_analytics` | JWT ADMIN/SUPER_ADMIN |
| `DELETE` | `/admin/stations/{code}` | Elimina estación, mediciones y agregaciones | JWT ADMIN/SUPER_ADMIN |
| `GET` | `/health` | Health check | Pública |

> **Advertencia:** el borrado administrativo es irreversible y elimina las
> mediciones y agregaciones asociadas. El estado debe coordinarse también con
> Auth Service; este backend no puede actualizar `station_registry`.

---

## Configuración

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `DB_URL` | URL JDBC de `noise_analytics` |
| `DB_USERNAME` | Rol de escritura restringido `noise_writer` en producción |
| `DB_PASSWORD` | Contraseña de PostgreSQL |
| `AUTH_ADMIN_VALIDATE_URL` | Endpoint interno de Auth para validar JWT admin |
| `PORT` | Puerto del servicio (default: 8082) |

No uses la cuenta propietaria `POSTGRES_NOISE_USER` en este servicio. La matriz
de permisos y la migración están en
[`docker/DATABASE_ROLES.md`](../docker/DATABASE_ROLES.md).

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
Header: Authorization: Bearer <JWT administrativo>
Body: { "locality": "Chapinero", "description": "..." }
← Auth devuelve el stationCode, la localidad canónica y el nombre generados
← Guarda el secret devuelto para configurar la Raspberry Pi

Paso 2 — Noise Processing Backend:
POST /admin/stations  →  http://noise-processing-backend:8082
Header: Authorization: Bearer <JWT administrativo>
Body: { "stationCode": "ST-CHAPINERO-01", "locality": "...",
        "latitude": 4.6486, "longitude": -74.1057 }
← Se copian exactamente stationCode y locality devueltos por Auth
← Las ediciones posteriores solo admiten descripción, dirección y coordenadas;
  código, nombre y localidad quedan inmutables
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
| `401 Unauthorized` | JWT administrativo ausente, inválido o revocado |
| `403 Forbidden` | Rol administrativo insuficiente |
