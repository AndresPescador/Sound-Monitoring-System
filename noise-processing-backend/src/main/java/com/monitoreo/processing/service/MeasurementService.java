package com.monitoreo.processing.service;

import com.monitoreo.processing.dto.MeasurementRequest;
import com.monitoreo.processing.dto.RegisterStationRequest;
import com.monitoreo.processing.dto.RegisterStationResponse;
import com.monitoreo.processing.entity.AcousticMeasurement;
import com.monitoreo.processing.entity.Station;
import com.monitoreo.processing.exception.StationAlreadyExistsException;
import com.monitoreo.processing.exception.StationNotFoundException;
import com.monitoreo.processing.repository.AcousticMeasurementRepository;
import com.monitoreo.processing.repository.StationRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
public class MeasurementService {

    private static final Logger log = LoggerFactory.getLogger(MeasurementService.class);

    private final StationRepository stationRepository;
    private final AcousticMeasurementRepository measurementRepository;
    private final AggregationService aggregationService;

    /**
     * Resultado del procesamiento de un fragmento acústico.
     * INSERTED: nuevo registro guardado.
     * DUPLICATE: ya existía, ignorado.
     */
    public enum ProcessResult { INSERTED, DUPLICATE }

    /**
     * Procesa un fragmento acústico recibido de la Ingestion API.
     *
     * Flujo:
     *   1. Buscar la estación por station_code.
     *   2. Verificar si ya existe ese fragmento (duplicado).
     *   3. Mapear el DTO a la entidad y persistir.
     *   4. Actualizar last_seen_at de la estación.
     *   5. Disparar el recálculo de la agregación horaria.
     */
    @Transactional
    public ProcessResult process(MeasurementRequest request) {
        Station station = stationRepository
                .findByStationCode(request.getStationCode())
                .orElseThrow(() -> new StationNotFoundException(request.getStationCode()));

        OffsetDateTime recordedAt = request.getTimestamp();

        // Verificar duplicado
        if (measurementRepository.existsByStationAndRecordedAt(station, recordedAt)) {
            log.info("Fragmento duplicado ignorado: estación={}, recorded_at={}",
                    station.getStationCode(), recordedAt);
            return ProcessResult.DUPLICATE;
        }

        // Mapear y persistir
        AcousticMeasurement measurement = mapToEntity(request, station);
        measurementRepository.save(measurement);

        // Actualizar last_seen_at
        station.setLastSeenAt(OffsetDateTime.now());
        stationRepository.save(station);

        log.info("Fragmento insertado: estación={}, recorded_at={}",
                station.getStationCode(), recordedAt);

        // Recalcular agregación horaria
        aggregationService.recalculate(station, recordedAt);

        return ProcessResult.INSERTED;
    }

    /**
     * Registra una nueva estación en noise_analytics.
     * Debe llamarse después de registrarla en el Auth Service.
     */
    @Transactional
    public RegisterStationResponse registerStation(RegisterStationRequest request) {
        if (stationRepository.existsByStationCode(request.getStationCode())) {
            throw new StationAlreadyExistsException(request.getStationCode());
        }

        Station station = new Station();
        station.setStationCode(request.getStationCode());
        station.setName(request.getName());
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

    private AcousticMeasurement mapToEntity(MeasurementRequest r, Station station) {
        AcousticMeasurement m = new AcousticMeasurement();
        m.setStation(station);
        m.setRecordedAt(r.getTimestamp());
        m.setDbfsLevel(r.getDbfsLevel());
        m.setRmsEnergy(r.getRmsEnergy());
        m.setLeqDbfs(r.getLeqDbfs());
        m.setChLeftDbfs(r.getChLeftDbfs());
        m.setChRightDbfs(r.getChRightDbfs());
        m.setChLeftRms(r.getChLeftRms());
        m.setChRightRms(r.getChRightRms());
        m.setIldDb(r.getIldDb());
        m.setInterauralCorrelation(r.getInterauralCorrelation());
        m.setDominantFrequency(r.getDominantFrequency());
        m.setSpectralCentroid(r.getSpectralCentroid());
        m.setSpectralRolloff(r.getSpectralRolloff());
        m.setZeroCrossingRate(r.getZeroCrossingRate());
        m.setDuration(r.getDuration());
        m.setSampleRate(r.getSampleRate());
        m.setStereo(r.getIsStereo());
        return m;
    }
}
