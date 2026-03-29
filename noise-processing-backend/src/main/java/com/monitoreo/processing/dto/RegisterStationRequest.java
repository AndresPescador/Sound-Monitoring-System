package com.monitoreo.processing.dto;

import lombok.Data;

/**
 * DTO para el endpoint POST /admin/stations.
 * Permite registrar una estación en noise_analytics.
 * Debe llamarse después de registrarla en el Auth Service.
 */
@Data
public class RegisterStationRequest {
    private String stationCode;
    private String name;
    private String description;
    private String locality;
    private String address;
    private Double latitude;
    private Double longitude;
}
