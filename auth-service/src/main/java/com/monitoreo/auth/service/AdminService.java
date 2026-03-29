package com.monitoreo.auth.service;

import com.monitoreo.auth.dto.RegisterStationRequest;
import com.monitoreo.auth.dto.RegisterStationResponse;
import com.monitoreo.auth.entity.RegisteredStation;
import com.monitoreo.auth.exception.StationAlreadyExistsException;
import com.monitoreo.auth.exception.StationNotFoundException;
import com.monitoreo.auth.repository.ApiTokenRepository;
import com.monitoreo.auth.repository.RegisteredStationRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AdminService {

    private static final Logger log = LoggerFactory.getLogger(AdminService.class);

    private final RegisteredStationRepository stationRepository;
    private final ApiTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * Registra una nueva estación de monitoreo.
     *
     * Genera un secret aleatorio, lo hashea con BCrypt y guarda solo el hash.
     * El secret en texto plano se devuelve UNA SOLA VEZ en la respuesta.
     * El administrador debe configurarlo en la Raspberry Pi inmediatamente.
     */
    @Transactional
    public RegisterStationResponse registerStation(RegisterStationRequest request) {
        if (stationRepository.existsByStationCode(request.getStationCode())) {
            throw new StationAlreadyExistsException(request.getStationCode());
        }

        // Generar secret aleatorio como UUID (suficientemente aleatorio y largo)
        String secret     = UUID.randomUUID().toString().replace("-", "");
        String secretHash = passwordEncoder.encode(secret);

        RegisteredStation station = new RegisteredStation();
        station.setStationCode(request.getStationCode());
        station.setName(request.getName());
        station.setDescription(request.getDescription());
        station.setLocality(request.getLocality());
        station.setSecretHash(secretHash);

        stationRepository.save(station);

        log.info("Estación registrada: {}", request.getStationCode());

        return new RegisterStationResponse(
                station.getStationCode(),
                station.getName(),
                station.getLocality(),
                secret   // devuelto solo aquí, nunca más recuperable
        );
    }

    /**
     * Revoca todos los tokens activos de una estación.
     * Útil cuando una estación es comprometida o reemplazada.
     */
    @Transactional
    public void revokeStationTokens(String stationCode) {
        RegisteredStation station = stationRepository
                .findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));

        int revoked = tokenRepository.revokeAllActiveTokensForStation(
                station,
                OffsetDateTime.now(),
                "Revocación manual por administrador"
        );

        log.info("Tokens revocados para estación: {}, cantidad: {}", stationCode, revoked);
    }

    /**
     * Desactiva una estación. Sus tokens existentes serán rechazados
     * en la próxima validación aunque no estén expirados ni revocados.
     */
    @Transactional
    public void deactivateStation(String stationCode) {
        RegisteredStation station = stationRepository
                .findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));

        station.setActive(false);
        stationRepository.save(station);

        log.info("Estación desactivada: {}", stationCode);
    }
}
