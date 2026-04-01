# Dashboard Frontend

Interfaz web del Sistema de Monitoreo Acústico Binaural — Bogotá D.C.

---

## Stack

| Herramienta | Versión | Función |
|---|---|---|
| React | 18 | UI |
| Vite | 5 | Build tool |
| Tailwind CSS | 3 | Estilos utilitarios |
| Recharts | 2 | Gráficas acústicas |
| Leaflet + react-leaflet | 1.9 / 4 | Mapa interactivo |
| Axios | 1.7.9 | HTTP (versión segura — evitar 1.14.x y 0.30.4) |
| date-fns | 3 | Formateo de fechas |
| React Router | 6 | Navegación SPA |

---

## Páginas

| Ruta | Descripción |
|---|---|
| `/` | Panel principal: cards resumen + mapa de Bogotá |
| `/stations/:code` | Detalle de estación: todas las gráficas |
| `/compare` | Comparación de métricas entre estaciones |
| `/data` | Portal de datos abiertos con descarga CSV |

---

## Instalación y ejecución local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con la IP del servidor

# Correr en desarrollo
npm run dev
# → http://localhost:3000

# Build para producción
npm run build
```

---

## Configuración

Editar `.env`:

```
VITE_API_URL=http://192.168.1.100/dashboard
```

Reemplazar `192.168.1.100` con la IP del PC servidor en la red local.

---

## Cambiar la paleta de colores

Todos los colores están definidos como tokens semánticos en `tailwind.config.js`.
Cambiar los valores ahí actualiza toda la interfaz automáticamente:

```js
colors: {
  primary: { DEFAULT: '#1d4ed8', ... },
  noise: {
    low:    '#16a34a',
    medium: '#d97706',
    high:   '#dc2626',
  },
  ...
}
```

---

## Docker

```bash
docker build -t dashboard-frontend .
docker run -p 3000:80 dashboard-frontend
```

Para pasar la variable de entorno en tiempo de build:
```bash
docker build --build-arg VITE_API_URL=http://192.168.1.100/dashboard -t dashboard-frontend .
```

---

## Agregar el frontend al Docker Compose

En `docker/docker-compose.yml`:

```yaml
dashboard-frontend:
  build:
    context: ../dashboard-frontend
    dockerfile: Dockerfile
    args:
      VITE_API_URL: http://${SERVER_IP}/dashboard
  container_name: dashboard-frontend
  ports:
    - "3000:80"
  restart: unless-stopped
```
