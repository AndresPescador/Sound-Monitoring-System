package com.monitoreo.processing.service;

import com.monitoreo.processing.dto.MeasurementRequest;
import com.monitoreo.processing.entity.AcousticMeasurement;
import com.monitoreo.processing.entity.Station;
import com.monitoreo.processing.exception.StationNotFoundException;
import com.monitoreo.processing.repository.AcousticMeasurementRepository;
import com.monitoreo.processing.repository.StationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MeasurementServiceTest {

    @Mock private StationRepository stationRepository;
    @Mock private AcousticMeasurementRepository measurementRepository;
    @Mock private AggregationService aggregationService;

    private MeasurementService service;
    private Station station;
    private MeasurementRequest request;

    @BeforeEach
    void setUp() {
        service = new MeasurementService(stationRepository, measurementRepository, aggregationService);
        station = new Station();
        station.setStationCode("ST-TEST-01");
        request = measurement("ST-TEST-01");
    }

    @Test
    void insertsMeasurementUpdatesStationAndRecalculatesAffectedHour() {
        when(stationRepository.findByStationCode("ST-TEST-01")).thenReturn(Optional.of(station));
        when(measurementRepository.existsByStationAndRecordedAt(station, request.getTimestamp()))
                .thenReturn(false);

        assertEquals(MeasurementService.ProcessResult.INSERTED, service.process(request));

        ArgumentCaptor<AcousticMeasurement> measurementCaptor =
                ArgumentCaptor.forClass(AcousticMeasurement.class);
        verify(measurementRepository).save(measurementCaptor.capture());
        assertEquals(station, measurementCaptor.getValue().getStation());
        assertEquals(-26.5, measurementCaptor.getValue().getLeqDbfs());
        verify(stationRepository).save(station);
        verify(aggregationService).recalculate(station, request.getTimestamp());
    }

    @Test
    void ignoresDuplicateWithoutWritingOrRecalculating() {
        when(stationRepository.findByStationCode("ST-TEST-01")).thenReturn(Optional.of(station));
        when(measurementRepository.existsByStationAndRecordedAt(station, request.getTimestamp()))
                .thenReturn(true);

        assertEquals(MeasurementService.ProcessResult.DUPLICATE, service.process(request));
        verify(measurementRepository, never()).save(any());
        verify(stationRepository, never()).save(any());
        verify(aggregationService, never()).recalculate(any(), any());
    }

    @Test
    void rejectsMeasurementForUnknownStation() {
        request = measurement("ST-UNKNOWN-01");
        when(stationRepository.findByStationCode("ST-UNKNOWN-01")).thenReturn(Optional.empty());

        assertThrows(StationNotFoundException.class, () -> service.process(request));
        verify(measurementRepository, never()).existsByStationAndRecordedAt(any(), any());
    }

    private MeasurementRequest measurement(String stationCode) {
        MeasurementRequest value = new MeasurementRequest();
        value.setStationCode(stationCode);
        value.setTimestamp(OffsetDateTime.parse("2026-08-30T15:42:00Z"));
        value.setDbfsLevel(-28.0);
        value.setRmsEnergy(0.04);
        value.setLeqDbfs(-26.5);
        value.setChLeftDbfs(-27.0);
        value.setChRightDbfs(-29.0);
        value.setChLeftRms(0.04);
        value.setChRightRms(0.03);
        value.setIldDb(2.0);
        value.setInterauralCorrelation(0.85);
        value.setDominantFrequency(440.0);
        value.setSpectralCentroid(900.0);
        value.setSpectralRolloff(1800.0);
        value.setZeroCrossingRate(0.12);
        value.setDuration(60.0);
        value.setSampleRate(44100);
        value.setIsStereo(true);
        return value;
    }
}
