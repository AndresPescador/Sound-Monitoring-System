FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias primero
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY app/ ./app/

RUN useradd --system --uid 10001 --create-home appuser && \
    chown -R appuser:appuser /app

USER appuser

# Puerto expuesto por el servicio
EXPOSE 8000

# Arrancar con uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
