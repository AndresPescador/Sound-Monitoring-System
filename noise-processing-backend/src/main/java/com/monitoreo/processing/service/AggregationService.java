package com.monitoreo.processing.service;

import com.monitoreo.processing.entity.AcousticMeasurement;
import com.monitoreo.processing.entity.HourlyAggregation;
import com.monitoreo.processing.entity.Station;
import com.monitoreo.processing.repository.AcousticMeasurementRepository;
import com.monitoreo.processing.repository.HourlyAggregationRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AggregationService {

    private static final Logger log = LoggerFactory.getLogger(AggregationService.class);

    private final AcousticMeasurementRepository measurementRepository;
    private final HourlyAggregationRepository aggregationRepository;

    /**
     * Recalcula la agregación horaria para una estación y hora dadas.
     *
     * Se llama después de cada INSERT exitoso en acoustic_measurements.
     * Si ya existe una aggregation para esa hora, la actualiza (ON CONFLICT UPDATE).
     * Si no existe, la crea.
     *
     * @param station   Estación de monitoreo
     * @param recordedAt Timestamp del fragmento recién insertado
     */
    @Transactional
    public void recalculate(Station station, OffsetDateTime recordedAt) {
        // Truncar al inicio de la hora
        OffsetDateTime hourStart = recordedAt.truncatedTo(ChronoUnit.HOURS);
        OffsetDateTime hourEnd   = hourStart.plusHours(1);

        // Obtener todos los fragmentos de esa hora para esa estación
        List<AcousticMeasurement> measurements = measurementRepository
                .findByStationAndHour(station, hourStart, hourEnd);

        if (measurements.isEmpty()) {
            log.warn("No se encontraron mediciones para agregar: estación={}, hora={}",
                    station.getStationCode(), hourStart);
            return;
        }

        // Extraer los valores de leq_dbfs y dbfs_level para los cálculos
        List<Double> leqValues  = measurements.stream().map(AcousticMeasurement::getLeqDbfs).toList();
        List<Double> dbfsValues = measurements.stream().map(AcousticMeasurement::getDbfsLevel).toList();

        HourlyAggregation agg = aggregationRepository
                .findByStationAndHourStart(station, hourStart)
                .orElse(new HourlyAggregation());

        agg.setStation(station);
        agg.setHourStart(hourStart);
        agg.setMeasurementCount(measurements.size());

        // Leq horario: promedio energético de los leq_dbfs
        agg.setLeqHour(computeLeq(leqValues));

        // Percentiles sobre leq_dbfs ordenados
        agg.setL10(computePercentile(leqValues, 90));  // superado 10% = percentil 90
        agg.setL50(computePercentile(leqValues, 50));  // superado 50% = percentil 50
        agg.setL90(computePercentile(leqValues, 10));  // superado 90% = percentil 10

        // Estadísticas de dbfs_level
        agg.setDbfsMin(dbfsValues.stream().mapToDouble(Double::doubleValue).min().orElse(0));
        agg.setDbfsMax(dbfsValues.stream().mapToDouble(Double::doubleValue).max().orElse(0));
        agg.setDbfsAvg(dbfsValues.stream().mapToDouble(Double::doubleValue).average().orElse(0));
        agg.setDbfsStddev(computeStddev(dbfsValues));

        // Promedios espectrales
        agg.setAvgDominantFrequency(average(measurements.stream().map(AcousticMeasurement::getDominantFrequency).toList()));
        agg.setAvgSpectralCentroid(average(measurements.stream().map(AcousticMeasurement::getSpectralCentroid).toList()));
        agg.setAvgSpectralRolloff(average(measurements.stream().map(AcousticMeasurement::getSpectralRolloff).toList()));
        agg.setAvgZeroCrossingRate(average(measurements.stream().map(AcousticMeasurement::getZeroCrossingRate).toList()));

        // Promedios binaurales
        agg.setAvgIldDb(average(measurements.stream().map(AcousticMeasurement::getIldDb).toList()));
        agg.setAvgInterauralCorr(average(measurements.stream().map(AcousticMeasurement::getInterauralCorrelation).toList()));

        agg.setComputedAt(OffsetDateTime.now());
        aggregationRepository.save(agg);

        log.info("Agregación actualizada: estación={}, hora={}, fragmentos={}",
                station.getStationCode(), hourStart, measurements.size());
    }

    /**
     * Calcula el nivel equivalente continuo (Leq) como promedio energético.
     * Leq = 10 * log10( mean( 10^(leq_i / 10) ) )
     */
    private double computeLeq(List<Double> leqValues) {
        double meanPower = leqValues.stream()
                .mapToDouble(v -> Math.pow(10, v / 10.0))
                .average()
                .orElse(0);
        return meanPower > 0 ? 10 * Math.log10(meanPower) : -100.0;
    }

    /**
     * Calcula un percentil sobre una lista de valores usando interpolación lineal.
     *
     * @param values     Lista de valores (no necesita estar ordenada previamente)
     * @param percentile Percentil deseado (0-100)
     */
    private double computePercentile(List<Double> values, double percentile) {
        if (values.isEmpty()) return 0;
        List<Double> sorted = values.stream().sorted().toList();
        double index = (percentile / 100.0) * (sorted.size() - 1);
        int lower = (int) Math.floor(index);
        int upper = (int) Math.ceil(index);
        if (lower == upper) return sorted.get(lower);
        double fraction = index - lower;
        return sorted.get(lower) * (1 - fraction) + sorted.get(upper) * fraction;
    }

    /**
     * Calcula la desviación estándar muestral de una lista de valores.
     */
    private double computeStddev(List<Double> values) {
        if (values.size() < 2) return 0;
        double mean = values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double variance = values.stream()
                .mapToDouble(v -> Math.pow(v - mean, 2))
                .sum() / (values.size() - 1);
        return Math.sqrt(variance);
    }

    private double average(List<Double> values) {
        return values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }
}
