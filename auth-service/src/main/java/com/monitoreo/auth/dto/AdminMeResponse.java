package com.monitoreo.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.OffsetDateTime;

@Getter
@AllArgsConstructor
public class AdminMeResponse {
    private String username;
    private boolean superAdmin;
    private OffsetDateTime lastLoginAt;
}
