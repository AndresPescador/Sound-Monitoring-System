package com.monitoreo.auth.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@JsonIgnoreProperties({"stationCode", "name"})
public class RegisterStationRequest {
    private String description;

    @NotBlank(message = "La localidad es requerida.")
    private String locality;
}
