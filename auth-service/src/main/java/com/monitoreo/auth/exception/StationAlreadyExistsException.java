package com.monitoreo.auth.exception;

public class StationAlreadyExistsException extends RuntimeException {
    public StationAlreadyExistsException(String stationCode) {
        super("La estación ya está registrada: " + stationCode);
    }
}
