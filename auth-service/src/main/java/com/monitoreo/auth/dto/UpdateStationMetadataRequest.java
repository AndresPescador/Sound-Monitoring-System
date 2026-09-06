package com.monitoreo.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Datos administrativos coordinados entre Auth y Processing. */
@Getter
@NoArgsConstructor
public class UpdateStationMetadataRequest {

    @NotBlank(message = "El nombre de la estación es requerido.")
    @Size(max = 150, message = "El nombre no puede superar 150 caracteres.")
    private String name;

    @NotBlank(message = "La localidad es requerida.")
    @Size(max = 100, message = "La localidad no puede superar 100 caracteres.")
    private String locality;

    private String description;

    @Size(max = 255, message = "La dirección no puede superar 255 caracteres.")
    private String address;

    @NotNull(message = "La latitud es requerida.")
    private Double latitude;

    @NotNull(message = "La longitud es requerida.")
    private Double longitude;
}
