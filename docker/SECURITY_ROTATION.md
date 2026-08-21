# Rotación de superadministrador y claves JWT

El repositorio llegó a contener un username y un hash BCrypt de
superadministrador. Esa credencial debe considerarse expuesta aunque ya no esté
presente en la versión actual, porque permanece en el historial de Git.

Este procedimiento no imprime ni guarda passwords en el repositorio. Ejecútalo
directamente en la VPS, desde el directorio `docker/`.

## Instalación existente

### 1. Preparar la utilidad BCrypt

```bash
sudo apt update
sudo apt install -y apache2-utils
```

### 2. Aplicar la migración de revocación de sesiones

```bash
docker compose exec -T postgres-auth sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < ../sql/V3__admin_credentials_version.sql
```

La migración es aditiva: incorpora `credentials_version` sin eliminar usuarios
ni datos existentes.

### 3. Rotar el password del superadministrador

```bash
bash ../sql/manage_super_admin.sh rotate
```

El script solicita el username y el password sin mostrar este último. El
password se transforma a BCrypt cost 12 y nunca se pasa como argumento a
`docker` o `psql`. La actualización incrementa `credentials_version`, de
modo que las sesiones anteriores dejan de ser válidas.

Usa un password nuevo que nunca haya aparecido en este repositorio ni en otro
servicio.

### 4. Rotar y separar las claves JWT

Genera dos valores independientes:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Guárdalos directamente en `docker/.env`:

```dotenv
STATION_JWT_SECRET=<primer_valor>
ADMIN_JWT_SECRET=<segundo_valor_distinto>
```

Elimina la variable antigua `JWT_SECRET`. No reutilices su valor en ninguna de
las dos variables nuevas.

Reconstruye Auth Service:

```bash
docker compose up -d --build auth-service
```

La separación invalida todos los JWT emitidos con la clave compartida anterior:

- Los administradores deben iniciar sesión con el password nuevo.
- Las estaciones deben solicitar un JWT nuevo usando su `station_code` y
  secret. Si un emisor conserva el JWT en caché y no se recupera automáticamente
  de un `401`, elimina únicamente su token local o reinicia el emisor.

## Instalación nueva

Después de iniciar PostgreSQL y Auth Service, crea el primer y único
superadministrador:

```bash
sudo apt install -y apache2-utils
bash ../sql/manage_super_admin.sh bootstrap
```

El bootstrap falla si `admin_users` ya contiene cualquier usuario. Los
administradores posteriores deben crearse desde el panel por un
superadministrador autenticado.

## Verificación

Comprueba, sin incluir tokens en el historial de la terminal:

1. Un JWT administrativo emitido antes de la rotación recibe `401`.
2. El superadministrador inicia sesión únicamente con el password nuevo.
3. Un JWT antiguo de estación es rechazado y uno recién emitido es aceptado.
4. Cambiar el password desde el panel cierra la sesión y exige autenticarse otra
   vez.

Reescribir el historial remoto de Git queda fuera de este procedimiento porque
afecta a todos los clones. Incluso si se coordina esa limpieza, la rotación
anterior continúa siendo obligatoria.
