package com.monitoreo.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class RegisterStationResponse {
    private String stationCode;
    private String name;
    private String locality;

    /**
     * Secret en texto plano generado al registrar la estación.
     * Devuelto UNA SOLA VEZ. No se puede recuperar después
     * porque solo se guarda el hash en la base de datos.
     */
    private String secret;
}
