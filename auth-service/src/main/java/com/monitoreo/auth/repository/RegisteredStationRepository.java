package com.monitoreo.auth.repository;

import com.monitoreo.auth.entity.RegisteredStation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RegisteredStationRepository extends JpaRepository<RegisteredStation, UUID> {
    Optional<RegisteredStation> findByStationCode(String stationCode);
    boolean existsByStationCode(String stationCode);
}
