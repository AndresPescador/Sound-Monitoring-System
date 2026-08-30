package com.monitoreo.processing.service;

import com.monitoreo.processing.entity.AcousticMeasurement;
import com.monitoreo.processing.entity.HourlyAggregation;
import com.monitoreo.processing.entity.Station;
import com.monitoreo.processing.repository.AcousticMeasurementRepository;
import com.monitoreo.processing.repository.HourlyAggregationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AggregationServiceTest {

    @Mock private AcousticMeasurementRepository measurementRepository;
    @Mock private HourlyAggregationRepository aggregationRepository;

    @Test
    void recalculatesEnergyPercentilesAndStatisticsForTheAffectedHour() {
        Station station = new Station();
        station.setStationCode("ST-TEST-01");
        OffsetDateTime recordedAt = OffsetDateTime.parse("2026-08-30T15:42:00Z");
        OffsetDateTime hourStart = OffsetDateTime.parse("2026-08-30T15:00:00Z");
        when(measurementRepository.findByStationAndHour(station, hourStart, hourStart.plusHours(1)))
                .thenReturn(List.of(measurement(-30.0, -35.0, 100.0), measurement(-20.0, -15.0, 200.0)));
        when(aggregationRepository.findByStationAndHourStart(station, hourStart))
                .thenReturn(Optional.empty());

        new AggregationService(measurementRepository, aggregationRepository).recalculate(station, recordedAt);

        ArgumentCaptor<HourlyAggregation> captor = ArgumentCaptor.forClass(HourlyAggregation.class);
        verify(aggregationRepository).save(captor.capture());
        HourlyAggregation aggregate = captor.getValue();
        assertEquals(hourStart, aggregate.getHourStart());
        assertEquals(2, aggregate.getMeasurementCount());
        assertEquals(-22.5964, aggregate.getLeqHour(), 0.001);
        assertEquals(-21.0, aggregate.getL10(), 0.001);
        assertEquals(-25.0, aggregate.getL50(), 0.001);
        assertEquals(-29.0, aggregate.getL90(), 0.001);
        assertEquals(-35.0, aggregate.getDbfsMin());
        assertEquals(-15.0, aggregate.getDbfsMax());
        assertEquals(-25.0, aggregate.getDbfsAvg());
        assertEquals(Math.sqrt(200.0), aggregate.getDbfsStddev(), 0.001);
        assertEquals(150.0, aggregate.getAvgDominantFrequency());
    }

    @Test
    void doesNotPersistEmptyAggregation() {
        Station station = new Station();
        OffsetDateTime recordedAt = OffsetDateTime.parse("2026-08-30T15:42:00Z");
        when(measurementRepository.findByStationAndHour(any(), any(), any())).thenReturn(List.of());

        new AggregationService(measurementRepository, aggregationRepository).recalculate(station, recordedAt);

        verifyNoInteractions(aggregationRepository);
    }

    private AcousticMeasurement measurement(double leq, double dbfs, double dominantFrequency) {
        AcousticMeasurement value = new AcousticMeasurement();
        value.setLeqDbfs(leq);
        value.setDbfsLevel(dbfs);
        value.setDominantFrequency(dominantFrequency);
        value.setSpectralCentroid(dominantFrequency * 2);
        value.setSpectralRolloff(dominantFrequency * 3);
        value.setZeroCrossingRate(0.1);
        value.setIldDb(2.0);
        value.setInterauralCorrelation(0.8);
        return value;
    }
}
