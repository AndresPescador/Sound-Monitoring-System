package com.monitoreo.processing.exception;

public class StationNotFoundException extends RuntimeException {
    public StationNotFoundException(String stationCode) {
        super("Estación no encontrada en noise_analytics: " + stationCode +
              ". Registre la estación con POST /admin/stations.");
    }
}
