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

# Config para React Router (todas las rutas → index.html).
# Escucha en 8080 para poder ejecutarse como usuario no-root (nginx).
RUN echo 'server { listen 8080; location / { root /usr/share/nginx/html; try_files $uri /index.html; } }' \
    > /etc/nginx/conf.d/default.conf \
    && touch /run/nginx.pid \
    && chown nginx:nginx /run/nginx.pid \
    && chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d /usr/share/nginx/html

USER nginx

EXPOSE 8080
