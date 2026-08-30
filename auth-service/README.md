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
│   │   └── AdminAuthController.java   # Login y operaciones administrativas
│   ├── dto/                           # Objetos de request y response
│   ├── entity/
│   │   ├── RegisteredStation.java     # Tabla registered_stations
│   │   ├── ApiToken.java              # Tabla api_tokens
│   │   └── AdminUser.java             # Tabla admin_users
│   ├── repository/                    # Spring Data JPA
│   ├── service/
│   │   ├── AuthService.java           # Emisión y validación de tokens
│   │   └── AdminAuthService.java      # Sesiones admin y gestión de estaciones
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
| `POST` | `/admin/login` | Iniciar sesión administrativa | Pública, rate limited |
| `POST` | `/admin/validate` | Validar JWT administrativo | Solo red interna |
| `GET` | `/admin/me` | Consultar sesión actual | JWT ADMIN/SUPER_ADMIN |
| `POST` | `/admin/change-password` | Cambiar password y revocar sesiones | JWT ADMIN/SUPER_ADMIN |
| `POST` | `/admin/admins` | Crear administrador normal | JWT SUPER_ADMIN |
| `GET` | `/admin/admins` | Listar administradores | JWT SUPER_ADMIN |
| `POST` | `/admin/stations` | Registrar nueva estación | JWT ADMIN/SUPER_ADMIN |
| `POST` | `/admin/stations/{code}/rotate-secret` | Rotar secret y tokens | JWT ADMIN/SUPER_ADMIN |
| `DELETE` | `/admin/stations/{code}/token` | Revocar tokens sin cambiar el secret | JWT ADMIN/SUPER_ADMIN |
| `PATCH` | `/admin/stations/{code}/status` | Activar o desactivar una estación | JWT ADMIN/SUPER_ADMIN |
| `GET` | `/auth/health` | Health check | Pública |

En ejecución directa las rutas administrativas empiezan por `/admin`. El
gateway Docker las publica como `/auth/admin/*`; `/admin/validate` permanece
interno.

---

## Configuración

Copiar `.env.example` como `.env`:

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `DB_URL` | URL JDBC de `station_registry` |
| `DB_USERNAME` | Rol restringido `auth_app` en producción |
| `DB_PASSWORD` | Contraseña de PostgreSQL |
| `STATION_JWT_SECRET` | Clave exclusiva para JWT de estaciones (mínimo 32 bytes) |
| `ADMIN_JWT_SECRET` | Clave distinta para JWT administrativos (mínimo 32 bytes) |
| `JWT_EXPIRATION_DAYS` | Días de validez del token (default: 30) |
| `ADMIN_JWT_EXPIRATION_HOURS` | Horas de validez de sesión admin (default: 8) |
| `CORS_ALLOWED_ORIGIN` | Origen exacto autorizado para el panel |
| `REDIS_HOST` / `REDIS_PORT` | Redis compartido para contadores de autenticación |
| `TRUSTED_PROXY_CIDRS` | Proxies autorizados a proporcionar una única `X-Forwarded-For` |
| `AUTH_TOKEN_RATE_LIMIT` | Solicitudes por IP y minuto a `/auth/token` (default: 30) |
| `ADMIN_LOGIN_RATE_LIMIT` | Intentos por IP y minuto a `/admin/login` (default: 10) |
| `PORT` | Puerto del servicio (default: 8081) |

Generar dos claves independientes:
```bash
openssl rand -base64 48
openssl rand -base64 48
```

Auth Service falla al iniciar si las claves son iguales. Para bootstrap y
rotación del superadministrador consulta
[`docker/SECURITY_ROTATION.md`](../docker/SECURITY_ROTATION.md).

En producción, `TRUSTED_PROXY_CIDRS` se fija desde Compose a la subred exclusiva
`auth_gateway`. No incluyas redes de clientes. Si Redis no está disponible, los
dos endpoints limitados responden `503` (fail closed) en vez de omitir el control.
La cuenta propietaria `POSTGRES_AUTH_USER` no debe reutilizarse aquí; consulta
[`docker/DATABASE_ROLES.md`](../docker/DATABASE_ROLES.md).

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
1. Un administrador autenticado llama POST /admin/stations
   Header: Authorization: Bearer <JWT administrativo>
   Body: { "locality": "Chapinero", "description": "..." }

2. Auth Service normaliza la localidad contra el catálogo oficial, incrementa
   atómicamente su contador y asigna el código siguiente, por ejemplo
   "ST-CHAPINERO-04". También genera el nombre inmutable
   "Estación ST-CHAPINERO-04" y un secret aleatorio del que guarda solo el hash.
   stationCode y name enviados por clientes antiguos se ignoran.

3. Respuesta devuelve el secret en texto plano UNA SOLA VEZ:
   { "stationCode": "ST-CHAPINERO-01", "name": "Estación ST-CHAPINERO-01",
     "locality": "Chapinero", "secret": "abc123..." }

4. Admin configura el secret en la Raspberry Pi (.env de la estación)
```

Antes de desplegar este contrato sobre una base existente se debe aplicar
`sql/V6__station_code_counters.sql`. La migración inicia cada contador con el
mayor sufijo numérico ya registrado y no reduce los contadores al borrar datos.

## Flujo de autenticación de una estación

```
1. Raspberry Pi llama POST /auth/token
   Body: { "stationCode": "ST-CHAPINERO-01", "secret": "abc123..." }

2. Auth Service verifica BCrypt(secret) == secret_hash

3. Genera JWT con claims: sub=stationCode, jti=UUID, token_type=station,
   iss=sound-monitoring-auth y exp=+30días
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
| `403 Forbidden` | Rol administrativo insuficiente |
| `404 Not Found` | station_code no existe |
| `429 Too Many Requests` | Cuota de autenticación agotada para la IP |
| `503 Service Unavailable` | Redis no permite aplicar el control de cuota |
