package com.monitoreo.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class RotateSecretResponse {
    private String stationCode;
    /**
     * El secret en texto plano. Se genera aquí y se devuelve UNA SOLA VEZ.
     * Después de esta respuesta es irrecuperable — solo existe el hash en BD.
     */
    private String newSecret;
    private String message;
}