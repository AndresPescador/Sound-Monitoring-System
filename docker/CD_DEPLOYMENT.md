# Continuous Deployment a la VPS

El workflow [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)
despliega automáticamente un push válido a `main` después de completar todos
los jobs actuales del CI. No despliega pull requests, no copia `docker/.env` y
no ejecuta migraciones ni reinicia PostgreSQL o Redis.

## Preparación única de la VPS

Ejecuta estos pasos desde una sesión administrativa en la VPS. No uses la
contraseña de `root` como secreto de GitHub Actions.

1. Genera en una máquina administrada una clave dedicada para Actions:

   ```bash
   ssh-keygen -t ed25519 -a 64 -f /ruta/segura/sound-monitoring-actions -C github-actions-sound-monitoring
   ```

2. Copia el código de esta versión del repositorio a la VPS sin incluir ningún
   `.env` y ejecuta el instalador con la clave **pública**:

   ```bash
   sudo bash docker/deploy/bootstrap-vps.sh /ruta/segura/sound-monitoring-actions.pub
   ```

   El instalador crea `sound-deploy`, instala el entrypoint root-owned
   `/usr/local/sbin/sound-monitoring-deploy`, conserva el `.env` existente y
   registra `/opt/sound-monitoring/releases/bootstrap-current` como rollback
   inicial. El usuario no se agrega al grupo `docker`.

3. Verifica el acceso antes de desactivar el acceso SSH de `root`:

   ```bash
   ssh -i /ruta/segura/sound-monitoring-actions sound-deploy@<VPS_HOST> true
   ```

4. Rota la contraseña de `root` que fue compartida y, tras validar el acceso
   de administración alternativo, deshabilita el login SSH de `root` según la
   política operativa de la VPS.

## Configuración de GitHub

En **Settings → Environments**, crea `production`, limita sus deployments a
la rama `main` y registra estos valores:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| Variable | `VPS_HOST` | Host o IP de la VPS |
| Variable | `VPS_PORT` | Puerto SSH, normalmente `22` |
| Variable | `VPS_DEPLOY_USER` | `sound-deploy` |
| Variable | `VPS_DEPLOY_PATH` | `/opt/sound-monitoring` |
| Secret | `VPS_DEPLOY_KEY` | Contenido de la clave privada generada en el paso 1 |
| Secret | `VPS_KNOWN_HOSTS` | Línea `host key` de la VPS, verificada fuera de banda |

Obtén `VPS_KNOWN_HOSTS` con `ssh-keyscan` únicamente después de comparar su
fingerprint mediante la consola o proveedor de la VPS. No aceptes una nueva
huella automáticamente desde el workflow.

## Comportamiento del despliegue

GitHub Actions crea un `git archive` del SHA que aprobó el CI, añade un
manifiesto de servicios y lo envía por SCP. La VPS verifica el checksum,
extrae la release bajo `/opt/sound-monitoring/releases/<sha>` y utiliza el
nombre de proyecto Compose `docker`, por lo que conserva las redes y volúmenes
existentes.

Se reconstruyen solo los servicios afectados:

- `auth-service`, `noise-processing-backend`, `ingestion-api`,
  `dashboard-api` y `dashboard-frontend` despliegan su servicio homólogo.
- `docker/nginx/nginx.conf` despliega `nginx`.
- `docker/docker-compose.yml` despliega todos los servicios de aplicación y
  `nginx`.
- Cambios en tests, documentación, `.github` y `send_metrics` no reinician la
  VPS.
- Cambios en `schema_*.sql` o `sql/` bloquean el CD y requieren aplicar la
  migración versionada manualmente antes de reintentar.
- Si cambia `docker/deploy/sound-monitoring-deploy`, el CD compara la huella
  del entrypoint instalado con la release y se bloquea hasta que un
  administrador lo reinstale manualmente con `bootstrap-vps.sh`.

Tras levantar los servicios se validan `/health`, `/auth/health`,
`/processing/health`, `/ingest/health`, `/dashboard/health` y `/`. Si alguno
falla, el script reconstruye la release anterior y vuelve a comprobarlos. El
workflow queda fallido aunque el rollback tenga éxito, para que el incidente
sea visible.
