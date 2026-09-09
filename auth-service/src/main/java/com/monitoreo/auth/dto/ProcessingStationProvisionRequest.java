package com.monitoreo.auth.dto;

public record ProcessingStationProvisionRequest(
        String name,
        String locality,
        String description,
        String address,
        Double latitude,
        Double longitude
) { }
