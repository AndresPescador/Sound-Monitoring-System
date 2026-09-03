package com.monitoreo.processing.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@JsonIgnoreProperties({"locality", "stationCode"})
public class UpdateStationRequest {

    @NotBlank(message = "El nombre de la estación es requerido.")
    @Size(max = 150, message = "El nombre no puede superar 150 caracteres.")
    private String name;

    private String description;

    private String address;

    @NotNull(message = "La latitud es requerida.")
    private Double latitude;

    @NotNull(message = "La longitud es requerida.")
    private Double longitude;
}
