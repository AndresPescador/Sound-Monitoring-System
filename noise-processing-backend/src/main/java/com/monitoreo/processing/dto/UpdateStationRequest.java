package com.monitoreo.processing.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class UpdateStationRequest {

    @NotBlank(message = "El nombre es requerido.")
    private String name;

    private String description;

    @NotBlank(message = "La localidad es requerida.")
    private String locality;

    private String address;

    @NotNull(message = "La latitud es requerida.")
    private Double latitude;

    @NotNull(message = "La longitud es requerida.")
    private Double longitude;
}