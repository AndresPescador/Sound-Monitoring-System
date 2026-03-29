package com.monitoreo.auth.dto;

import lombok.Data;

@Data
public class TokenRequest {
    private String stationCode;
    private String secret;
}
