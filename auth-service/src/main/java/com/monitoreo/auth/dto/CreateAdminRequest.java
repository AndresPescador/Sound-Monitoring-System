package com.monitoreo.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CreateAdminRequest {

    @NotBlank(message = "El username es requerido.")
    @Size(min = 3, max = 50)
    @Pattern(regexp = "^[a-zA-Z0-9_-]+$",
             message = "El username solo puede contener letras, números, guiones y guiones bajos.")
    private String username;

    @NotBlank(message = "El password es requerido.")
    @Size(min = 12, message = "El password debe tener al menos 12 caracteres.")
    private String password;
}