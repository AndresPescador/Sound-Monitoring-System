package com.monitoreo.processing.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "hourly_aggregations")
@Getter
@Setter
@NoArgsConstructor
public class HourlyAggregation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "station_id", nullable = false)
    private Station station;

    // Inicio de la hora agregada (ej: 2025-06-16T08:00:00+00)
    @Column(name = "hour_start", nullable = false)
    private OffsetDateTime hourStart;

    @Column(name = "measurement_count", nullable = false)
    private Integer measurementCount;

    // ── Nivel equivalente continuo ────────────────────────────────────────────
    @Column(name = "leq_hour", nullable = false)
    private Double leqHour;

    // ── Percentiles estándar acústicos ────────────────────────────────────────
    @Column(name = "l10", nullable = false)
    private Double l10;

    @Column(name = "l50", nullable = false)
    private Double l50;

    @Column(name = "l90", nullable = false)
    private Double l90;

    // ── Estadísticas de nivel global ──────────────────────────────────────────
    @Column(name = "dbfs_min", nullable = false)
    private Double dbfsMin;

    @Column(name = "dbfs_max", nullable = false)
    private Double dbfsMax;

    @Column(name = "dbfs_avg", nullable = false)
    private Double dbfsAvg;

    @Column(name = "dbfs_stddev", nullable = false)
    private Double dbfsStddev;

    // ── Promedios espectrales ─────────────────────────────────────────────────
    @Column(name = "avg_dominant_frequency", nullable = false)
    private Double avgDominantFrequency;

    @Column(name = "avg_spectral_centroid", nullable = false)
    private Double avgSpectralCentroid;

    @Column(name = "avg_spectral_rolloff", nullable = false)
    private Double avgSpectralRolloff;

    @Column(name = "avg_zero_crossing_rate", nullable = false)
    private Double avgZeroCrossingRate;

    // ── Promedios binaurales ──────────────────────────────────────────────────
    @Column(name = "avg_ild_db", nullable = false)
    private Double avgIldDb;

    @Column(name = "avg_interaural_corr", nullable = false)
    private Double avgInterauralCorr;

    @Column(name = "computed_at", nullable = false)
    private OffsetDateTime computedAt = OffsetDateTime.now();
}
