package com.monitoreo.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** Contrato interno Auth -> Processing. */
@Getter
@AllArgsConstructor
public class ProcessingMetadataSyncRequest {
    private long metadataVersion;
    private String name;
    private String locality;
    private String description;
    private String address;
    private Double latitude;
    private Double longitude;
}
