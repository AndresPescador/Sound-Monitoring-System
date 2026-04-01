# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app
COPY package.json .
RUN npm install

COPY . .
RUN npm run build

# ── Serve con Nginx ────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Config para React Router (todas las rutas → index.html)
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; try_files $uri /index.html; } }' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 80
