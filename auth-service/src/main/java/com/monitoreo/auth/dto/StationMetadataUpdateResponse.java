package com.monitoreo.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class StationMetadataUpdateResponse {
    private String stationCode;
    private long metadataVersion;
    private String syncStatus;
    private String message;
}
