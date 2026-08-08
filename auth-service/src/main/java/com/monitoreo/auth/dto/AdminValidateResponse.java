package com.monitoreo.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class AdminValidateResponse {
    private String username;
    private String role;   // "SUPER_ADMIN" o "ADMIN"
    private boolean valid;
}