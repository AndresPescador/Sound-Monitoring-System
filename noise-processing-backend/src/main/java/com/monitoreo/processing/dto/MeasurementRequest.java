package com.monitoreo.processing.dto;

import lombok.Data;

import java.time.OffsetDateTime;

/**
 * DTO que mapea el JSON enviado por la Ingestion API.
 * Contiene todos los campos generados por process_audio.py
 * más el station_code adjuntado por la Ingestion API.
 */
@Data
public class MeasurementRequest {

    // Adjuntado por la Ingestion API tras validar el token
    private String stationCode;

    // ── Meta ──────────────────────────────────────────────────────────────────
    private OffsetDateTime timestamp;   // mapped from "timestamp" in JSON
    private String filename;
    private Double duration;
    private Integer sampleRate;
    private Boolean isStereo;

    // ── Nivel global ──────────────────────────────────────────────────────────
    private Double dbfsLevel;
    private Double rmsEnergy;
    private Double leqDbfs;

    // ── Por canal ─────────────────────────────────────────────────────────────
    private Double chLeftDbfs;
    private Double chRightDbfs;
    private Double chLeftRms;
    private Double chRightRms;

    // ── Binaural ──────────────────────────────────────────────────────────────
    private Double ildDb;
    private Double interauralCorrelation;

    // ── Espectral ─────────────────────────────────────────────────────────────
    private Double dominantFrequency;
    private Double spectralCentroid;
    private Double spectralRolloff;
    private Double zeroCrossingRate;
}
