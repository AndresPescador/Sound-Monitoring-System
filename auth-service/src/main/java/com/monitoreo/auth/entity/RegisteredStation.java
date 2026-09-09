package com.monitoreo.auth.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "registered_stations")
@Getter @Setter @NoArgsConstructor
public class RegisteredStation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "station_code", nullable = false, unique = true, length = 50)
    private String stationCode;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "locality", nullable = false, length = 100)
    private String locality;

    /** Versión que ordena las actualizaciones de metadatos enviadas a Processing. */
    @Column(name = "metadata_version", nullable = false)
    private long metadataVersion = 0;

    @Column(name = "lifecycle_status", nullable = false, length = 24)
    private String lifecycleStatus = "READY";

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "secret_hash", nullable = false)
    private String secretHash;

    @Column(name = "registered_at", nullable = false, updatable = false)
    private OffsetDateTime registeredAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }
}
