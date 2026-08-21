# Despliegue HTTPS en VPS con Nginx y Certbot

Esta configuración mantiene el gateway Docker en `127.0.0.1:8080`. Solo el
Nginx instalado en la VPS escucha públicamente en `80/443`.

Los ejemplos asumen el dominio `soundmonitoring.systems`. Si cambia, reemplázalo
en los dos archivos `vps-*.conf.example`, en el comando de Certbot y en
`VITE_API_URL`.

## 1. Preparar DNS y variables

El registro `A` —y `AAAA`, si se utilizará IPv6— debe apuntar a la VPS. En
`docker/.env`:

```dotenv
NGINX_PORT=8080
VITE_API_URL=https://soundmonitoring.systems/dashboard
CORS_ALLOWED_ORIGIN=https://soundmonitoring.systems
STATION_JWT_SECRET=<valor_aleatorio_independiente>
ADMIN_JWT_SECRET=<otro_valor_aleatorio>
```

Genera las dos claves JWT por separado con `openssl rand -base64 48`. Si la
instalación ya usó la antigua clave compartida, aplica primero el procedimiento
de [rotación de seguridad](SECURITY_ROTATION.md).

Iniciar Compose y comprobar el gateway local:

```bash
cd docker
docker compose up --build -d
curl http://127.0.0.1:8080/health
```

`docker compose ps` debe mostrar `127.0.0.1:8080->80/tcp` para Nginx; nunca
`0.0.0.0:8080`.

## 2. Instalar Nginx y Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot
sudo mkdir -p /var/www/certbot
sudo cp nginx/vps-bootstrap.conf.example /etc/nginx/sites-available/sound-monitoring
sudo ln -s /etc/nginx/sites-available/sound-monitoring /etc/nginx/sites-enabled/sound-monitoring
sudo unlink /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

El archivo bootstrap solo expone el desafío ACME. El resto del sitio devuelve
`503`, evitando credenciales sobre HTTP durante la emisión inicial.

## 3. Emitir el certificado

```bash
sudo certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --domain soundmonitoring.systems
```

No copies claves privadas al repositorio ni al contenedor Docker.

## 4. Activar la configuración definitiva

```bash
sudo cp nginx/vps-site.conf.example /etc/nginx/sites-available/sound-monitoring
sudo install -m 0755 nginx/certbot-renewal-hook.sh \
  /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo nginx -t
sudo systemctl reload nginx
```

La configuración definitiva redirige HTTP a HTTPS, rechaza hosts desconocidos,
habilita TLS 1.2/1.3, HSTS, CSP y los encabezados de seguridad del navegador.
También sobrescribe `X-Forwarded-For` con la IP real de la conexión y limita en
el borde la emisión de tokens y el login administrativo. No cambies esa cabecera
por `$proxy_add_x_forwarded_for`: permitiría reintroducir valores del cliente.

## 5. Verificar emisión y renovación

```bash
curl -I http://soundmonitoring.systems/health
curl -I https://soundmonitoring.systems/health
sudo certbot renew --dry-run
```

Resultados esperados:

- HTTP devuelve `301` hacia `https://soundmonitoring.systems/...`.
- HTTPS devuelve HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` y `Permissions-Policy`.
- La prueba de renovación termina correctamente y valida Nginx antes de recargar.

Para comprobar el límite sin usar credenciales reales, envía repetidamente un
JSON inválido a `POST /auth/admin/login`: tras la ráfaga permitida, Nginx debe
responder `429`. Espera el intervalo indicado antes de repetir la prueba para no
bloquear temporalmente tu propia IP.

No habilites `includeSubDomains` o `preload` en HSTS hasta confirmar que todos
los subdominios presentes y futuros estarán disponibles únicamente por HTTPS.
