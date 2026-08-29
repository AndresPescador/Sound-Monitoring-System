package com.monitoreo.auth.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

@Data
@JsonIgnoreProperties("name")
public class RegisterStationRequest {
    private String stationCode;
    private String description;
    private String locality;
}
