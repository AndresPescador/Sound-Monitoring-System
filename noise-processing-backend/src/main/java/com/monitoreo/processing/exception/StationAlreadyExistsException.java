package com.monitoreo.processing.exception;

public class StationAlreadyExistsException extends RuntimeException {
    public StationAlreadyExistsException(String stationCode) {
        super("La estación ya existe en noise_analytics: " + stationCode);
    }
}
