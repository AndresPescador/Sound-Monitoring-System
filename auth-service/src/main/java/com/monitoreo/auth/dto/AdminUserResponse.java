package com.monitoreo.auth.dto;

import com.monitoreo.auth.entity.AdminUser;
import lombok.Getter;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
public class AdminUserResponse {
    private final UUID id;
    private final String username;
    private final boolean superAdmin;
    private final boolean active;
    private final OffsetDateTime createdAt;
    private final OffsetDateTime lastLoginAt;

    public AdminUserResponse(AdminUser admin) {
        this.id          = admin.getId();
        this.username    = admin.getUsername();
        this.superAdmin  = admin.isSuperAdmin();
        this.active      = admin.isActive();
        this.createdAt   = admin.getCreatedAt();
        this.lastLoginAt = admin.getLastLoginAt();
    }
}