package com.monitoreo.processing.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Contrato privado consumido únicamente por Auth Service. */
@Getter
@NoArgsConstructor
public class InternalStationMetadataSyncRequest {
    @NotNull(message = "La versión de metadatos es requerida.")
    @PositiveOrZero(message = "La versión de metadatos no puede ser negativa.")
    private Long metadataVersion;

    @NotBlank(message = "El nombre de la estación es requerido.")
    @Size(max = 150)
    private String name;

    @NotBlank(message = "La localidad es requerida.")
    @Size(max = 100)
    private String locality;

    private String description;

    @Size(max = 255)
    private String address;

    @NotNull(message = "La latitud es requerida.")
    private Double latitude;

    @NotNull(message = "La longitud es requerida.")
    private Double longitude;
}
