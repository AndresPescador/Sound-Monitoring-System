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

@Service
@RequiredArgsConstructor
public class StationAdminService {

    private static final Logger log = LoggerFactory.getLogger(StationAdminService.class);

    private final StationRepository stationRepository;

    @Transactional
    public RegisterStationResponse registerStation(RegisterStationRequest request) {
        if (stationRepository.existsByStationCode(request.getStationCode())) {
            throw new StationAlreadyExistsException(request.getStationCode());
        }

        Station station = new Station();
        station.setStationCode(request.getStationCode());
        station.setName("Estación " + request.getStationCode());
        station.setDescription(request.getDescription());
        station.setLocality(request.getLocality());
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

        station.setDescription(request.getDescription());
        station.setAddress(request.getAddress());
        station.setLatitude(request.getLatitude());
        station.setLongitude(request.getLongitude());
        stationRepository.save(station);

        log.info("Estación actualizada en noise_analytics: {}", stationCode);
        return new StationAdminResponse(station);
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
}
