# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL
ARG VITE_MAPTILER_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY
RUN npm run build

# ── Serve con Nginx ────────────────────────────────────────────────────────────
FROM nginx:alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913
COPY --from=build /app/dist /usr/share/nginx/html

# Config para React Router (todas las rutas → index.html).
# Escucha en 8080 para poder ejecutarse como usuario no-root (nginx).
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN touch /run/nginx.pid \
    && chown nginx:nginx /run/nginx.pid \
    && chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d /usr/share/nginx/html

USER nginx

EXPOSE 8080
