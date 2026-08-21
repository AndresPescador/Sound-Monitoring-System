# Usuarios PostgreSQL con privilegios mínimos

Las cuentas `POSTGRES_AUTH_USER` y `POSTGRES_NOISE_USER` son propietarias de sus
bases y se reservan para inicialización, migraciones y mantenimiento. Ningún
backend recibe sus credenciales.

| Rol fijo | Base | Uso | Privilegios principales |
|---|---|---|---|
| `auth_app` | `station_registry` | Auth Service | DML de autenticación; el audit log solo admite `SELECT/INSERT` |
| `noise_writer` | `noise_analytics` | Noise Processing | Escritura operativa sin crear objetos ni tablas temporales |
| `dashboard_reader` | `noise_analytics` | Dashboard API | Solo `SELECT`; `default_transaction_read_only=on` como defensa adicional |

Los roles no tienen `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION` ni
`BYPASSRLS`. Se revocan `CREATE` sobre el schema, `TEMPORARY` sobre la base y los
privilegios implícitos de `PUBLIC`. Los privilegios por defecto mantienen estas
restricciones en objetos futuros creados por el propietario: cada migración que
añada una tabla, secuencia o función debe conceder explícitamente solo lo que
necesite su consumidor.
`dashboard_reader` incorpora además límites de 5s por consulta, 1s de espera de
bloqueo y 5s para transacciones inactivas.
Si el rol ya existía antes de incorporar estos límites, vuelve a ejecutar
`bash ../sql/apply_least_privilege_roles.sh` desde `docker/`.

## Instalación nueva

Genera tres contraseñas diferentes y guárdalas únicamente en `docker/.env`:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 48
```

```dotenv
AUTH_DB_PASSWORD=<valor_1>
NOISE_PROCESSOR_DB_PASSWORD=<valor_2>
DASHBOARD_DB_PASSWORD=<valor_3>
```

En volúmenes nuevos, Compose ejecuta automáticamente los scripts de creación de
roles, después los schemas y finalmente las concesiones de privilegios.

## Migración de una instalación existente

Los scripts de `/docker-entrypoint-initdb.d` no se vuelven a ejecutar cuando el
volumen ya contiene datos. Por eso, tras añadir las tres variables anteriores:

```bash
cd docker

# Recrea solo los contenedores PostgreSQL para incorporar variables y mounts.
docker compose up -d --no-deps postgres-auth postgres-noise

# Crea/actualiza los roles y aplica V4/V5 sin borrar datos.
bash ../sql/apply_least_privilege_roles.sh

# Cambia los backends a sus nuevas identidades restringidas.
docker compose up -d --build auth-service noise-processing dashboard-api
```

No ejecutes el último comando antes de aplicar V4/V5: los backends nuevos no
podrían conectarse si sus roles aún no existen.

## Verificación

```bash
docker compose ps
curl http://127.0.0.1:8080/auth/health
curl http://127.0.0.1:8080/processing/health
curl http://127.0.0.1:8080/dashboard/health
```

Para revisar atributos y ACL como propietario, sin mostrar contraseñas:

```bash
docker compose exec postgres-auth sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\\du auth_app" -c "\\dp"'

docker compose exec postgres-noise sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "\\du noise_writer" -c "\\du dashboard_reader" -c "\\dp"'
```
