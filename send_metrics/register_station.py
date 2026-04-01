#!/usr/bin/env python3
"""
register_station.py — Registra una nueva estación en el sistema.

Realiza las dos llamadas necesarias en orden:
  1. POST /admin/auth/stations    → Auth Service (genera el secret)
  2. POST /admin/processing/stations → Noise Processing Backend

Uso:
    Editar las variables en la sección CONFIGURACIÓN y ejecutar:
    python register_station.py
"""

import json
import sys
import httpx

# =============================================================================
# CONFIGURACIÓN — Editar antes de ejecutar
# =============================================================================

SERVER_URL    = "http://localhost"   # IP del PC servidor
ADMIN_API_KEY = "IM4lNE1lCiRswtvOyKHZ5cqQukAM403Y5IqJk4FDuX0="   # Valor de ADMIN_API_KEY del servidor

# Datos de la nueva estación
STATION = {
    "stationCode": "ST-CHAPINERO-01",   # Código único. Convención: ST-{LOCALIDAD}-{NÚMERO}
    "name":        "Estación Chapinero Centro",
    "locality":    "Chapinero",
    "description": "Estación binaural ubicada en Chapinero, altura media",
    "address":     "Calle 53 # 13-40, Chapinero, Bogotá",
    "latitude":    4.6486,
    "longitude":  -74.1057,
}

# =============================================================================
# NO MODIFICAR A PARTIR DE AQUÍ
# =============================================================================

AUTH_URL       = f"{SERVER_URL}/admin/auth/stations"
PROCESSING_URL = f"{SERVER_URL}/admin/processing/stations"
HEADERS        = {"X-Admin-Key": ADMIN_API_KEY, "Content-Type": "application/json"}


def step1_register_auth() -> str:
    """Registra la estación en el Auth Service y devuelve el secret generado."""
    print(f"\n[1/2] Registrando en Auth Service → {AUTH_URL}")
    payload = {
        "stationCode": STATION["stationCode"],
        "name":        STATION["name"],
        "locality":    STATION["locality"],
        "description": STATION.get("description", ""),
    }
    try:
        response = httpx.post(AUTH_URL, json=payload, headers=HEADERS, timeout=10.0)
    except httpx.ConnectError:
        print(f"ERROR: No se pudo conectar al servidor en {SERVER_URL}")
        print("Verifica que el servidor esté encendido y que SERVER_URL sea correcta.")
        sys.exit(1)

    if response.status_code == 409:
        print(f"ADVERTENCIA: La estación '{STATION['stationCode']}' ya existe en el Auth Service.")
        print("Si necesitas el secret original, no es recuperable. Revoca el token y re-registra.")
        sys.exit(1)

    if response.status_code != 201:
        print(f"ERROR: Auth Service respondió {response.status_code}: {response.text}")
        sys.exit(1)

    data   = response.json()
    secret = data["secret"]
    print(f"  Estación registrada en Auth Service.")
    print(f"  station_code : {data['stationCode']}")
    print(f"  secret       : {secret}")
    print(f"\n GUARDA ESTE SECRET — no se puede recuperar después.\n")
    return secret


def step2_register_processing():
    """Registra la estación en el Noise Processing Backend."""
    print(f"[2/2] Registrando en Noise Processing Backend → {PROCESSING_URL}")
    payload = {
        "stationCode": STATION["stationCode"],
        "name":        STATION["name"],
        "locality":    STATION["locality"],
        "description": STATION.get("description", ""),
        "address":     STATION.get("address", ""),
        "latitude":    STATION["latitude"],
        "longitude":   STATION["longitude"],
    }
    try:
        response = httpx.post(PROCESSING_URL, json=payload, headers=HEADERS, timeout=10.0)
    except httpx.ConnectError:
        print(f"ERROR: No se pudo conectar al servidor en {SERVER_URL}")
        sys.exit(1)

    if response.status_code == 409:
        print(f"ADVERTENCIA: La estación '{STATION['stationCode']}' ya existe en noise_analytics.")
        return

    if response.status_code != 201:
        print(f"ERROR: Noise Processing respondió {response.status_code}: {response.text}")
        print("La estación YA FUE registrada en el Auth Service.")
        print("Debes registrarla manualmente en noise_analytics o resolver el error.")
        sys.exit(1)

    data = response.json()
    print(f"  Estación registrada en Noise Processing Backend.")
    print(f"  id           : {data['id']}")
    print(f"  station_code : {data['stationCode']}")


def main():
    print("=" * 55)
    print(" Registro de estación — Monitoreo Acústico Binaural")
    print("=" * 55)
    print(f"  Servidor     : {SERVER_URL}")
    print(f"  station_code : {STATION['stationCode']}")
    print(f"  Localidad    : {STATION['locality']}")

    secret = step1_register_auth()
    step2_register_processing()

    print("\n" + "=" * 55)
    print(" Registro completado exitosamente")
    print("=" * 55)
    print(f"\n  Configura estos valores en el .env de la Raspberry Pi:")
    print(f"\n  STATION_CODE={STATION['stationCode']}")
    print(f"  STATION_SECRET={secret}")
    print(f"  SERVER_URL={SERVER_URL}")
    print()


if __name__ == "__main__":
    main()
