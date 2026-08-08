package com.monitoreo.processing.dto;

import com.monitoreo.processing.entity.Station;
import lombok.Getter;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Respuesta completa de una estación para el panel de administración.
 * Incluye campos operativos (lastSeenAt, installedAt) que no se exponen
 * en el dashboard público.
 */
@Getter
public class StationAdminResponse {

    private final UUID id;
    private final String stationCode;
    private final String name;
    private final String description;
    private final String locality;
    private final String address;
    private final Double latitude;
    private final Double longitude;
    private final boolean active;
    private final OffsetDateTime installedAt;
    private final OffsetDateTime lastSeenAt;
    private final OffsetDateTime createdAt;
    private final OffsetDateTime updatedAt;

    public StationAdminResponse(Station station) {
        this.id          = station.getId();
        this.stationCode = station.getStationCode();
        this.name        = station.getName();
        this.description = station.getDescription();
        this.locality    = station.getLocality();
        this.address     = station.getAddress();
        this.latitude    = station.getLatitude();
        this.longitude   = station.getLongitude();
        this.active      = station.isActive();
        this.installedAt = station.getInstalledAt();
        this.lastSeenAt  = station.getLastSeenAt();
        this.createdAt   = station.getCreatedAt();
        this.updatedAt   = station.getUpdatedAt();
    }
}