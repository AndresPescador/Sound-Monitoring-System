package com.monitoreo.auth.dto;

import lombok.Data;

@Data
public class RegisterStationRequest {
    private String stationCode;
    private String name;
    private String description;
    private String locality;
}
