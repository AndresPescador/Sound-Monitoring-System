package com.monitoreo.auth.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RegisterStationRequest {
    @NotBlank(message = "El nombre de la estación es requerido.")
    @Size(max = 150, message = "El nombre no puede superar 150 caracteres.")
    private String name;

    private String description;

    @NotBlank(message = "La localidad es requerida.")
    @Size(max = 100, message = "La localidad no puede superar 100 caracteres.")
    private String locality;

    @Size(max = 255, message = "La dirección no puede superar 255 caracteres.")
    private String address;

    @NotNull(message = "La latitud es requerida.")
    @DecimalMin(value = "-90.0", message = "La latitud debe ser mayor o igual a -90.")
    @DecimalMax(value = "90.0", message = "La latitud debe ser menor o igual a 90.")
    private Double latitude;

    @NotNull(message = "La longitud es requerida.")
    @DecimalMin(value = "-180.0", message = "La longitud debe ser mayor o igual a -180.")
    @DecimalMax(value = "180.0", message = "La longitud debe ser menor o igual a 180.")
    private Double longitude;
}
