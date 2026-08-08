package com.monitoreo.processing.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Configura el WebClient para llamadas HTTP internas entre microservicios.
 * Noise Processing lo usa para validar tokens de admin con el Auth Service.
 *
 * Se requiere agregar la dependencia en pom.xml:
 *
 * (WebFlux solo se usa para el WebClient — no convierte el servicio a reactivo)
 */
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient webClient() {
        return WebClient.builder()
                .defaultHeader("Content-Type", "application/json")
                .build();
    }
}
