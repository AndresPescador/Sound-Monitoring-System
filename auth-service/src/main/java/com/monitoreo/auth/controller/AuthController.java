package com.monitoreo.auth.controller;

import com.monitoreo.auth.dto.TokenRequest;
import com.monitoreo.auth.dto.TokenResponse;
import com.monitoreo.auth.dto.ValidateRequest;
import com.monitoreo.auth.dto.ValidateResponse;
import com.monitoreo.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * POST /auth/token
     *
     * Endpoint que llama la estación (Raspberry Pi) para obtener su JWT.
     * La estación presenta su station_code y secret.
     * Si las credenciales son correctas se devuelve el token.
     */
    @PostMapping("/token")
    public ResponseEntity<TokenResponse> requestToken(@RequestBody TokenRequest request) {
        return ResponseEntity.ok(authService.issueToken(request));
    }

    /**
     * POST /auth/validate
     *
     * Endpoint que llama la Ingestion API para verificar un token.
     * Si el token es válido devuelve el station_code asociado (HTTP 200).
     * Si no es válido devuelve HTTP 401 (manejado por GlobalExceptionHandler).
     */
    @PostMapping("/validate")
    public ResponseEntity<ValidateResponse> validateToken(@RequestBody ValidateRequest request) {
        return ResponseEntity.ok(authService.validateToken(request));
    }

    /**
     * GET /health
     *
     * Health check para el Load Balancer.
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok", "service", "auth-service"));
    }
}
