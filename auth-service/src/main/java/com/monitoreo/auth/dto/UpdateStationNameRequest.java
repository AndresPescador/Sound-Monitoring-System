package com.monitoreo.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateStationNameRequest {

    @NotBlank(message = "El nombre de la estación es requerido.")
    @Size(max = 150, message = "El nombre no puede superar 150 caracteres.")
    private String name;
}
