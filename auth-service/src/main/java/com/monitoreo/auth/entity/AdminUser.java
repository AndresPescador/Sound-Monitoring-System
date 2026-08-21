package com.monitoreo.auth.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "admin_users")
@Getter @Setter @NoArgsConstructor
public class AdminUser {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "username", nullable = false, unique = true, length = 50)
    private String username;

    /**
     * Hash BCrypt (cost 12) del password.
     * Nunca se expone en ninguna respuesta HTTP.
     */
    @Column(name = "password_hash", nullable = false, length = 60)
    private String passwordHash;

    /**
     * TRUE solo para el primer administrador creado via script de inicialización.
     * Solo un super-admin puede crear otros administradores.
     */
    @Column(name = "is_super", nullable = false)
    private boolean superAdmin = false;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    /**
     * Se incluye en cada JWT de administrador. Incrementarlo invalida todas las
     * sesiones emitidas anteriormente, por ejemplo tras cambiar el password.
     */
    @Column(name = "credentials_version", nullable = false)
    private long credentialsVersion = 1L;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @Column(name = "last_login_at")
    private OffsetDateTime lastLoginAt;

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }
}
