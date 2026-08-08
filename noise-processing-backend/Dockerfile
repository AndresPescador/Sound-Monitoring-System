# ── Build stage ───────────────────────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q

COPY src ./src
RUN mvn clean package -DskipTests -q

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app
COPY --from=build /app/target/noise-processing-backend-1.0.0.jar app.jar

RUN useradd --system --uid 10001 --create-home appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8082

ENTRYPOINT ["java", "-jar", "app.jar"]
