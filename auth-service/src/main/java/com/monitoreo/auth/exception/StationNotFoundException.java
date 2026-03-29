package com.monitoreo.auth.exception;

public class StationNotFoundException extends RuntimeException {
    public StationNotFoundException(String stationCode) {
        super("Estación no encontrada: " + stationCode);
    }
}
