package com.monitoreo.processing.repository;

import com.monitoreo.processing.entity.HourlyAggregation;
import com.monitoreo.processing.entity.Station;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.Optional;

public interface HourlyAggregationRepository extends JpaRepository<HourlyAggregation, Long> {

    /**
     * Busca la agregación existente para una estación y hora específica.
     * Usado para decidir si hacer INSERT o UPDATE en la agregación horaria.
     */
    Optional<HourlyAggregation> findByStationAndHourStart(
            Station station,
            OffsetDateTime hourStart
    );
}
