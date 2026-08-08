package com.monitoreo.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class AdminChangePasswordRequest {

    @NotBlank(message = "El password actual es requerido.")
    private String currentPassword;

    @NotBlank(message = "El nuevo password es requerido.")
    @Size(min = 12, message = "El nuevo password debe tener al menos 12 caracteres.")
    private String newPassword;
}