package com.monitoreo.processing.repository;

import com.monitoreo.processing.entity.AcousticMeasurement;
import com.monitoreo.processing.entity.Station;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;

public interface AcousticMeasurementRepository extends JpaRepository<AcousticMeasurement, Long> {

    boolean existsByStationAndRecordedAt(Station station, OffsetDateTime recordedAt);

    /**
     * Obtiene todas las métricas de una estación dentro de una hora específica.
     * Usado por AggregationService para recalcular hourly_aggregations.
     *
     * hour_start: inicio truncado de la hora (ej: 2025-06-16T08:00:00)
     * hour_end:   inicio de la hora siguiente (ej: 2025-06-16T09:00:00)
     */
    @Query("""
            SELECT m FROM AcousticMeasurement m
            WHERE m.station = :station
              AND m.recordedAt >= :hourStart
              AND m.recordedAt < :hourEnd
            ORDER BY m.recordedAt ASC
            """)
    List<AcousticMeasurement> findByStationAndHour(
            @Param("station") Station station,
            @Param("hourStart") OffsetDateTime hourStart,
            @Param("hourEnd") OffsetDateTime hourEnd
    );
}
