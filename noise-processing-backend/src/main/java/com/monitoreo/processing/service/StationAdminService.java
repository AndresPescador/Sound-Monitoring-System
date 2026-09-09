package com.monitoreo.processing.service;

import com.monitoreo.processing.dto.*;
import com.monitoreo.processing.entity.Station;
import com.monitoreo.processing.exception.StationAlreadyExistsException;
import com.monitoreo.processing.exception.StationNotFoundException;
import com.monitoreo.processing.repository.StationRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class StationAdminService {

    private static final Logger log = LoggerFactory.getLogger(StationAdminService.class);

    private final StationRepository stationRepository;

    @Transactional
    public RegisterStationResponse registerStation(RegisterStationRequest request) {
        StationCodeValidator.requireValid(request.getStationCode());
        if (stationRepository.existsByStationCode(request.getStationCode())) {
            throw new StationAlreadyExistsException(request.getStationCode());
        }

        Station station = new Station();
        station.setStationCode(request.getStationCode());
        station.setName(request.getName().trim());
        station.setDescription(request.getDescription());
        station.setLocality(request.getLocality().trim());
        station.setAddress(request.getAddress());
        station.setLatitude(request.getLatitude());
        station.setLongitude(request.getLongitude());
        stationRepository.save(station);

        log.info("Estación registrada en noise_analytics: {}", request.getStationCode());

        return new RegisterStationResponse(
                station.getId(),         
                station.getStationCode(),
                station.getName(),
                station.getLocality()
        );
    }

    @Transactional
    public void provisionStation(String stationCode, InternalStationProvisionRequest request) {
        StationCodeValidator.requireValid(stationCode);
        String name = request.getName().trim();
        String locality = request.getLocality().trim();
        var existing = stationRepository.findByStationCode(stationCode);
        if (existing.isPresent()) {
            Station station = existing.get();
            boolean sameSnapshot = Objects.equals(station.getName(), name)
                    && Objects.equals(station.getLocality(), locality)
                    && Objects.equals(station.getDescription(), request.getDescription())
                    && Objects.equals(station.getAddress(), request.getAddress())
                    && Objects.equals(station.getLatitude(), request.getLatitude())
                    && Objects.equals(station.getLongitude(), request.getLongitude());
            if (!sameSnapshot) {
                throw new StationAlreadyExistsException(stationCode);
            }
            return;
        }

        Station station = new Station();
        station.setStationCode(stationCode);
        station.setName(name);
        station.setLocality(locality);
        station.setDescription(request.getDescription());
        station.setAddress(request.getAddress());
        station.setLatitude(request.getLatitude());
        station.setLongitude(request.getLongitude());
        stationRepository.save(station);
        log.info("Estación aprovisionada internamente: {}", stationCode);
    }

    @Transactional(readOnly = true)
    public List<StationAdminResponse> listStations() {
        return stationRepository.findAll()
                .stream()
                .map(StationAdminResponse::new)
                .toList();
    }

    @Transactional(readOnly = true)
    public StationAdminResponse getStation(String stationCode) {
        Station station = stationRepository.findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));
        return new StationAdminResponse(station);
    }

    @Transactional
    public StationAdminResponse updateStation(String stationCode, UpdateStationRequest request) {
        Station station = stationRepository.findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));

        station.setName(request.getName().trim());
        station.setDescription(request.getDescription());
        station.setAddress(request.getAddress());
        station.setLatitude(request.getLatitude());
        station.setLongitude(request.getLongitude());
        stationRepository.save(station);

        log.info("Estación actualizada en noise_analytics: {}", stationCode);
        return new StationAdminResponse(station);
    }

    /** Aplica un snapshot de Auth únicamente si no es más antiguo que el actual. */
    @Transactional
    public void synchronizeMetadata(String stationCode, InternalStationMetadataSyncRequest request) {
        StationCodeValidator.requireValid(stationCode);
        Station station = stationRepository.findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));
        long incomingVersion = request.getMetadataVersion();
        if (incomingVersion < station.getMetadataVersion()) {
            log.info("Se descartó versión antigua {} para estación {}", incomingVersion, stationCode);
            return;
        }
        if (incomingVersion == station.getMetadataVersion()) return;

        station.setName(request.getName().trim());
        station.setLocality(request.getLocality().trim());
        station.setDescription(request.getDescription());
        station.setAddress(request.getAddress());
        station.setLatitude(request.getLatitude());
        station.setLongitude(request.getLongitude());
        station.setMetadataVersion(incomingVersion);
        stationRepository.save(station);
        log.info("Metadatos sincronizados para estación {} (versión {})", stationCode, incomingVersion);
    }

    @Transactional
    public StationAdminResponse changeStatus(String stationCode, boolean active) {
        Station station = stationRepository.findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));

        station.setActive(active);
        stationRepository.save(station);

        log.info("Estación {} {} en noise_analytics",
                stationCode, active ? "activada" : "desactivada");
        return new StationAdminResponse(station);
    }

    @Transactional
    public void deleteStation(String stationCode) {
        Station station = stationRepository.findByStationCode(stationCode)
                .orElseThrow(() -> new StationNotFoundException(stationCode));

        stationRepository.delete(station);
        log.info("Estación eliminada de noise_analytics: {}", stationCode);
    }

    @Transactional
    public void deleteStationIfPresent(String stationCode) {
        StationCodeValidator.requireValid(stationCode);
        stationRepository.findByStationCode(stationCode).ifPresent(station -> {
            stationRepository.delete(station);
            log.info("Estación purgada internamente de noise_analytics: {}", stationCode);
        });
    }
}
