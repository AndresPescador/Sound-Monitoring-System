package com.monitoreo.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class StationSyncStatusResponse {
    private String stationCode;
    private String status;
    private int attempts;
    private String lastError;
}
