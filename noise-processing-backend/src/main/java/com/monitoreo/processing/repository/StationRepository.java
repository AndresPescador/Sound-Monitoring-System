package com.monitoreo.processing.repository;

import com.monitoreo.processing.entity.Station;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface StationRepository extends JpaRepository<Station, UUID> {
    Optional<Station> findByStationCode(String stationCode);
    boolean existsByStationCode(String stationCode);
}
