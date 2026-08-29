package com.monitoreo.processing.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@JsonIgnoreProperties({"name", "locality", "stationCode"})
public class UpdateStationRequest {

    private String description;

    private String address;

    @NotNull(message = "La latitud es requerida.")
    private Double latitude;

    @NotNull(message = "La longitud es requerida.")
    private Double longitude;
}
