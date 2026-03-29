package com.monitoreo.processing.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.UUID;

@Data
@AllArgsConstructor
public class RegisterStationResponse {
    private UUID id;
    private String stationCode;
    private String name;
    private String locality;
}
