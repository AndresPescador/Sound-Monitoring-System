# Sound Monitoring Ingestion Backend

Capa de ingesta del Sistema de Monitoreo Acústico Binaural.

Recibe las métricas acústicas generadas por `process_audio.py` en cada estación, valida su formato y autenticidad, y las reenvía al Noise Processing Backend por una red interna.

---

## Estructura

```
ingestion-api/
├── app/
│   ├── main.py              # Punto de entrada FastAPI
│   ├── config.py            # Variables de entorno
│   ├── dependencies.py      # Validación del token Bearer
│   ├── routers/
│   │   └── ingest.py        # POST /ingest  |  GET /health
│   ├── schemas/
│   │   └── measurement.py   # Modelos Pydantic (validación del JSON)
│   └── services/
│       ├── auth.py          # Llamada HTTP al Auth Service
│       └── forward.py       # Reenvío al Processing Backend
├── requirements.txt
├── Dockerfile
└── .env.example
```

---

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/ingest` | Recibe métricas de una estación |
| `GET` | `/health` | Health check |

---

## Configuración

Copiar `.env.example` como `.env` y completar los valores:

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `AUTH_SERVICE_URL` | URL interna completa de validación en Auth Service |
| `PROCESSING_BACKEND_URL` | URL interna completa de escritura en Processing |
| `PORT` | Puerto del servicio (default: `8000`) |

---

## Ejecución local

```bash
# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env

# Correr el servicio
uvicorn app.main:app --reload --port 8000
```

La documentación interactiva (Swagger) queda disponible en `http://localhost:8000/docs`.

---

## Docker

```bash
# Construir imagen
docker build -t ingestion-api .

# Correr contenedor
docker run -p 8000:8000 --env-file .env ingestion-api
```

---

## Flujo de una petición

```
Estación
  │  POST /ingest  { JSON métricas }
  │  Authorization: Bearer <token>
  ▼
Ingestion API
  │  1. Pydantic valida el JSON (HTTP 422 si falla)
  │  2. Extrae el token del header Authorization
  │  3. Llama al Auth Service → obtiene station_code (HTTP 401/503 si falla)
  │  4. Reenvía JSON + station_code al Processing Backend (HTTP 503 si falla)
  │  5. Devuelve HTTP 201 a la estación
  ▼
Red privada `service_internal` → Noise Processing Backend
```

---

## Códigos de respuesta

| Código | Situación |
|---|---|
| `201 Created` | Métricas recibidas y reenviadas correctamente |
| `401 Unauthorized` | Token ausente, inválido o expirado |
| `422 Unprocessable Entity` | JSON con formato incorrecto |
| `503 Service Unavailable` | Auth Service o Processing Backend no disponibles |
