# Station Authentication Service

Servicio de autenticación del Sistema de Monitoreo Acústico Binaural.

Gestiona el registro de estaciones, la emisión de tokens JWT y la validación de tokens para la Ingestion API.

---

## Estructura

```
auth-service/
├── src/main/java/com/monitoreo/auth/
│   ├── AuthServiceApplication.java
│   ├── config/
│   │   ├── SecurityConfig.java        # Spring Security (stateless, sin sesión)
│   │   └── JwtConfig.java             # Generación y validación de JWT
│   ├── controller/
│   │   ├── AuthController.java        # POST /auth/token  |  POST /auth/validate
│   │   └── AdminController.java       # POST /admin/stations  |  DELETE /admin/...
│   ├── dto/                           # Objetos de request y response
│   ├── entity/
│   │   ├── RegisteredStation.java     # Tabla registered_stations
│   │   └── ApiToken.java              # Tabla api_tokens
│   ├── repository/                    # Spring Data JPA
│   ├── service/
│   │   ├── AuthService.java           # Emisión y validación de tokens
│   │   └── AdminService.java          # Registro y revocación de estaciones
│   └── exception/                     # Excepciones y manejador global
└── src/main/resources/
    └── application.properties
```

---

## Endpoints

| Método | Ruta | Descripción | Protección |
|---|---|---|---|
| `POST` | `/auth/token` | Estación solicita JWT con su secret | Pública |
| `POST` | `/auth/validate` | Ingestion API valida un token | Solo red interna |
| `POST` | `/admin/stations` | Registrar nueva estación | X-Admin-Key |
| `DELETE` | `/admin/stations/{code}/token` | Revocar tokens activos | X-Admin-Key |
| `DELETE` | `/admin/stations/{code}` | Desactivar estación | X-Admin-Key |
| `GET` | `/auth/health` | Health check | Pública |

---

## Configuración

Copiar `.env.example` como `.env`:

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `DB_URL` | URL JDBC de `station_registry` |
| `DB_USERNAME` | Usuario de PostgreSQL |
| `DB_PASSWORD` | Contraseña de PostgreSQL |
| `JWT_SECRET` | Clave secreta en texto plano (mínimo 32 caracteres) |
| `JWT_EXPIRATION_DAYS` | Días de validez del token (default: 30) |
| `ADMIN_API_KEY` | Clave para endpoints `/admin/*` |
| `PORT` | Puerto del servicio (default: 8081) |

Generar un JWT_SECRET seguro:
```bash
openssl rand -base64 32
```

---

## Ejecución local

```bash
# Compilar
mvn clean package -DskipTests

# Correr (con variables de entorno cargadas)
java -jar target/auth-service-1.0.0.jar
```

---

## Docker

```bash
# Construir imagen
docker build -t auth-service .

# Correr contenedor
docker run -p 8081:8081 --env-file .env auth-service
```

---

## Flujo de registro de una estación

```
1. Admin llama POST /admin/stations con { station_code, name, locality, ... }
   Header: X-Admin-Key: <clave>

2. Auth Service genera secret aleatorio, lo hashea con BCrypt
   y guarda solo el hash en registered_stations

3. Respuesta devuelve el secret en texto plano UNA SOLA VEZ:
   { "stationCode": "ST-CHAPINERO-01", "secret": "abc123..." }

4. Admin configura el secret en la Raspberry Pi (.env de la estación)
```

## Flujo de autenticación de una estación

```
1. Raspberry Pi llama POST /auth/token
   Body: { "stationCode": "ST-CHAPINERO-01", "secret": "abc123..." }

2. Auth Service verifica BCrypt(secret) == secret_hash

3. Genera JWT con claims: sub=stationCode, jti=UUID, exp=+30días
   Guarda el jti en api_tokens

4. Devuelve: { "token": "eyJ..." }

5. Raspberry Pi incluye el token en cada petición a la Ingestion API:
   Authorization: Bearer eyJ...
```

## Flujo de validación (llamado por Ingestion API)

```
1. Ingestion API llama POST /auth/validate
   Body: { "token": "eyJ..." }

2. Auth Service verifica firma JWT → extrae jti

3. Busca jti en api_tokens → verifica is_revoked y expires_at

4. Verifica que la estación esté activa

5. Devuelve: { "stationCode": "ST-CHAPINERO-01" }   → HTTP 200
   o error                                            → HTTP 401
```

---

## Códigos de respuesta

| Código | Situación |
|---|---|
| `200 OK` | Token válido / operación exitosa |
| `201 Created` | Estación registrada |
| `401 Unauthorized` | Secret incorrecto o token inválido/expirado/revocado |
| `403 Forbidden` | X-Admin-Key ausente o incorrecta |
| `404 Not Found` | station_code no existe |
| `409 Conflict` | station_code ya registrado |
