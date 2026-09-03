package com.monitoreo.processing.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * DTO para el endpoint POST /admin/stations.
 * Permite registrar una estación en noise_analytics.
 * Debe llamarse después de registrarla en el Auth Service.
 */
@Data
public class RegisterStationRequest {
    @NotBlank(message = "El código de la estación es requerido.")
    @Size(max = 50, message = "El código no puede superar 50 caracteres.")
    private String stationCode;

    @NotBlank(message = "El nombre de la estación es requerido.")
    @Size(max = 150, message = "El nombre no puede superar 150 caracteres.")
    private String name;

    private String description;

    @NotBlank(message = "La localidad es requerida.")
    @Size(max = 100, message = "La localidad no puede superar 100 caracteres.")
    private String locality;

    private String address;

    @NotNull(message = "La latitud es requerida.")
    private Double latitude;

    @NotNull(message = "La longitud es requerida.")
    private Double longitude;
}
