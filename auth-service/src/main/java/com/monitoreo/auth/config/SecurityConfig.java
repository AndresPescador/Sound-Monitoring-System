package com.monitoreo.auth.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /**
     * Dominio público del sistema. Se configura vía variable de entorno
     * para poder usar '*' en desarrollo sin cambiar código.
     *
     * En producción: https://soundmonitoring.systems
     * En desarrollo: http://localhost:3000
     */
    @Value("${cors.allowed-origin}")
    private String allowedOrigin;

    /**
     * Desactiva la seguridad por defecto de Spring Security.
     * La autenticación se gestiona manualmente:
     *   - /auth/*       → JWT de estación (AuthService)
     *   - /admin/login  → público (AdminAuthService)
     *   - /admin/*      → JWT de admin (AdminTokenValidator)
     *
     * CORS habilitado porque el navegador ahora llama directamente
     * a /admin/* desde el frontend.
     */
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        config.setAllowedOrigins(List.of(allowedOrigin));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        // No se necesita allowCredentials=true porque usamos Bearer token, no cookies
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // Solo aplica CORS a las rutas admin que el navegador llama directamente.
        // /auth/token y /auth/validate los llaman servicios internos, no el navegador.
        source.registerCorsConfiguration("/admin/**", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // BCrypt cost 12 para passwords de administradores humanos.
        // El cost 10 (default) está bien para estaciones, pero para admins
        // humanos el costo adicional de ~400ms es aceptable y más seguro.
        return new BCryptPasswordEncoder(12);
    }
}
