package com.monitoreo.processing.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "acoustic_measurements")
@Getter
@Setter
@NoArgsConstructor
public class AcousticMeasurement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "station_id", nullable = false)
    private Station station;

    // Timestamp de inicio del fragmento (extraído del nombre del .wav)
    @Column(name = "recorded_at", nullable = false)
    private OffsetDateTime recordedAt;

    // ── Nivel global ──────────────────────────────────────────────────────────
    @Column(name = "dbfs_level", nullable = false)
    private Double dbfsLevel;

    @Column(name = "rms_energy", nullable = false)
    private Double rmsEnergy;

    @Column(name = "leq_dbfs", nullable = false)
    private Double leqDbfs;

    // ── Por canal ─────────────────────────────────────────────────────────────
    @Column(name = "ch_left_dbfs", nullable = false)
    private Double chLeftDbfs;

    @Column(name = "ch_right_dbfs", nullable = false)
    private Double chRightDbfs;

    @Column(name = "ch_left_rms", nullable = false)
    private Double chLeftRms;

    @Column(name = "ch_right_rms", nullable = false)
    private Double chRightRms;

    // ── Binaural ──────────────────────────────────────────────────────────────
    @Column(name = "ild_db", nullable = false)
    private Double ildDb;

    @Column(name = "interaural_correlation", nullable = false)
    private Double interauralCorrelation;

    // ── Espectral ─────────────────────────────────────────────────────────────
    @Column(name = "dominant_frequency", nullable = false)
    private Double dominantFrequency;

    @Column(name = "spectral_centroid", nullable = false)
    private Double spectralCentroid;

    @Column(name = "spectral_rolloff", nullable = false)
    private Double spectralRolloff;

    @Column(name = "zero_crossing_rate", nullable = false)
    private Double zeroCrossingRate;

    // ── Meta ──────────────────────────────────────────────────────────────────
    @Column(name = "duration", nullable = false)
    private Double duration;

    @Column(name = "sample_rate", nullable = false)
    private Integer sampleRate;

    @Column(name = "is_stereo", nullable = false)
    private Boolean stereo;

    @Column(name = "received_at", nullable = false, updatable = false)
    private OffsetDateTime receivedAt = OffsetDateTime.now();
}
