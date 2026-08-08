package com.monitoreo.auth.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * Entidad actualizada de AuthAuditLog.
 *
 * Cambios respecto a la versión anterior:
 *   - Campo adminUser (FK a admin_users) — NULL si el evento es de una estación
 *   - Campo ipAddress — origen de la petición HTTP
 *
 * La tabla en BD debe tener estas columnas (ver V2__admin_users.sql).
 */
@Entity
@Table(name = "auth_audit_log")
@Getter @Setter @NoArgsConstructor
public class AuthAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // NULL si el evento es de un admin, no de una estación
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "station_id")
    private RegisteredStation station;

    // NULL si el evento es de una estación, no de un admin
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admin_user_id")
    private AdminUser adminUser;

    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    @Column(name = "success", nullable = false)
    private boolean success;

    @Column(name = "detail")
    private String detail;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private OffsetDateTime occurredAt = OffsetDateTime.now();
}
