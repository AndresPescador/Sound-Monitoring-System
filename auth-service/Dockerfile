# ── Build stage ───────────────────────────────────────────────────────────────
FROM maven:3.9.11-eclipse-temurin-17@sha256:e4a7ace3dc0d645ed97f8d9ad0b0d3f0b14fa8d150138f27f116d7105a639b82 AS build

WORKDIR /app
COPY pom.xml .
# Descargar dependencias en capa separada (aprovecha cache de Docker)
RUN mvn dependency:go-offline -q

COPY src ./src
RUN mvn clean package -DskipTests -q

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-jammy@sha256:1e38389ecd9e5c444e40d4385be4a4a5f56a836a38a6e41c099810c32ec1c595

WORKDIR /app
COPY --from=build /app/target/auth-service-1.0.0.jar app.jar

RUN useradd --system --uid 10001 --create-home appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8081

ENTRYPOINT ["java", "-jar", "app.jar"]
