package com.monitoreo.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.OffsetDateTime;

@Getter
@AllArgsConstructor
public class AdminLoginResponse {
    private String accessToken;
    private String tokenType = "Bearer";
    private OffsetDateTime expiresAt;
    private String username;
    private boolean superAdmin;

    public AdminLoginResponse(String accessToken, OffsetDateTime expiresAt,
                              String username, boolean superAdmin) {
        this.accessToken = accessToken;
        this.expiresAt   = expiresAt;
        this.username    = username;
        this.superAdmin  = superAdmin;
    }
}