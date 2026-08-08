package com.monitoreo.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class AdminLoginRequest {

    @NotBlank(message = "El username es requerido.")
    @Size(max = 50)
    private String username;

    @NotBlank(message = "El password es requerido.")
    private String password;
}