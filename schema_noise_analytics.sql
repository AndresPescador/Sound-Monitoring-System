-- =============================================================================
-- Base de datos: noise_analytics
-- Descripción:   Almacena las métricas acústicas crudas generadas por el script
--                process_audio.py y las agregaciones horarias calculadas por el
--                Noise Processing Backend.
--
-- Uso:
--   psql -U postgres -c "CREATE DATABASE noise_analytics;"
--   psql -U postgres -d noise_analytics -f schema_noise_analytics.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensión para UUIDs
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================================================
-- TABLA: stations
-- Registro de todas las estaciones de monitoreo del sistema.
-- Aunque las credenciales viven en la base de autenticación, esta tabla
-- mantiene los metadatos operativos y de ubicación de cada estación,
-- necesarios para relacionar las mediciones con su origen geográfico.
-- =============================================================================
CREATE TABLE IF NOT EXISTS stations (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identificador legible único de la estación (ej: "ST-CHAPINERO-01")
    station_code    VARCHAR(50)     NOT NULL UNIQUE,

    name            VARCHAR(150)    NOT NULL,
    description     TEXT,

    -- Ubicación geográfica
    locality        VARCHAR(100)    NOT NULL,   -- Localidad de Bogotá
    address         VARCHAR(255),
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,

    -- Estado operativo
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    installed_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ,               -- Actualizado en cada ingesta

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  stations                IS 'Registro de estaciones de monitoreo acústico desplegadas en Bogotá.';
COMMENT ON COLUMN stations.station_code   IS 'Código único legible de la estación. Ej: ST-CHAPINERO-01';
COMMENT ON COLUMN stations.locality       IS 'Localidad de Bogotá donde está instalada la estación.';
COMMENT ON COLUMN stations.last_seen_at   IS 'Timestamp de la última métrica recibida de esta estación.';


-- =============================================================================
-- TABLA: acoustic_measurements
-- Datos crudos: un registro por cada fragmento de audio procesado (cada ~2 min).
-- Todas las columnas corresponden directamente a los campos del JSON generado
-- por process_audio.py.
-- =============================================================================
CREATE TABLE IF NOT EXISTS acoustic_measurements (
    id                      BIGSERIAL       PRIMARY KEY,
    station_id              UUID            NOT NULL REFERENCES stations(id) ON DELETE CASCADE,

    -- Timestamp de inicio del fragmento de grabación (extraído del nombre del archivo)
    recorded_at             TIMESTAMPTZ     NOT NULL,

    -- ── Métricas globales (mix mono, señal cruda) ─────────────────────────
    dbfs_level              DOUBLE PRECISION NOT NULL,   -- Nivel RMS en dBFS
    rms_energy              DOUBLE PRECISION NOT NULL,   -- Energía RMS lineal [0.0 - 1.0]
    leq_dbfs                DOUBLE PRECISION NOT NULL,   -- Nivel equivalente continuo con ponderación A

    -- ── Métricas por canal ────────────────────────────────────────────────
    ch_left_dbfs            DOUBLE PRECISION NOT NULL,   -- Nivel dBFS canal izquierdo
    ch_right_dbfs           DOUBLE PRECISION NOT NULL,   -- Nivel dBFS canal derecho
    ch_left_rms             DOUBLE PRECISION NOT NULL,   -- RMS canal izquierdo
    ch_right_rms            DOUBLE PRECISION NOT NULL,   -- RMS canal derecho

    -- ── Métricas binaurales ───────────────────────────────────────────────
    -- ILD positivo = predominio izquierdo; negativo = predominio derecho
    ild_db                  DOUBLE PRECISION NOT NULL,

    -- +1.0 = campo difuso/frontal; cercano a 0 = fuente lateral definida
    interaural_correlation  DOUBLE PRECISION NOT NULL,

    -- ── Métricas espectrales ──────────────────────────────────────────────
    dominant_frequency      DOUBLE PRECISION NOT NULL,   -- Hz, estimada via STFT
    spectral_centroid       DOUBLE PRECISION NOT NULL,   -- Hz, centro de masa espectral
    spectral_rolloff        DOUBLE PRECISION NOT NULL,   -- Hz, 85% de energía acumulada
    zero_crossing_rate      DOUBLE PRECISION NOT NULL,   -- Tasa de cruces por cero

    -- ── Metadatos del fragmento ───────────────────────────────────────────
    duration                DOUBLE PRECISION NOT NULL,   -- Duración en segundos
    sample_rate             INTEGER          NOT NULL,   -- Frecuencia de muestreo en Hz
    is_stereo               BOOLEAN          NOT NULL,   -- True si el archivo tenía 2 canales

    -- Timestamp de recepción en el backend (distinto de recorded_at)
    received_at             TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    -- Evita duplicados si la estación reenvía un fragmento ya procesado
    CONSTRAINT uq_measurement_station_time UNIQUE (station_id, recorded_at)
);

COMMENT ON TABLE  acoustic_measurements              IS 'Métricas acústicas crudas. Un registro por cada fragmento de audio de ~2 minutos procesado por process_audio.py.';
COMMENT ON COLUMN acoustic_measurements.recorded_at  IS 'Inicio del fragmento de grabación. Extraído del nombre del archivo .wav por el script.';
COMMENT ON COLUMN acoustic_measurements.received_at  IS 'Timestamp de llegada del dato al backend. Puede diferir de recorded_at si hay envíos diferidos.';
COMMENT ON COLUMN acoustic_measurements.leq_dbfs     IS 'Nivel equivalente continuo calculado con filtro de ponderación A (IEC 61672). Comparable con normativas de ruido ambiental.';
COMMENT ON COLUMN acoustic_measurements.ild_db       IS 'Interaural Level Difference: ch_left_dbfs - ch_right_dbfs en dB.';

-- Índices para las consultas más frecuentes del dashboard
CREATE INDEX IF NOT EXISTS idx_measurements_station_time
    ON acoustic_measurements (station_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_measurements_recorded_at
    ON acoustic_measurements (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_measurements_station_leq
    ON acoustic_measurements (station_id, leq_dbfs);


-- =============================================================================
-- TABLA: hourly_aggregations
-- Agregaciones estadísticas por hora, calculadas por el Noise Processing Backend.
-- Un registro por cada hora completa por estación.
-- Estas son las que consulta el dashboard para visualizaciones históricas,
-- evitando recalcular sobre millones de filas de acoustic_measurements.
-- =============================================================================
CREATE TABLE IF NOT EXISTS hourly_aggregations (
    id                      BIGSERIAL       PRIMARY KEY,
    station_id              UUID            NOT NULL REFERENCES stations(id) ON DELETE CASCADE,

    -- Hora de inicio del período agregado (ej: 2025-06-16 08:00:00+00)
    hour_start              TIMESTAMPTZ     NOT NULL,

    -- Número de fragmentos incluidos en esta agregación (idealmente 30 para 2 min c/u)
    measurement_count       INTEGER         NOT NULL,

    -- ── Nivel equivalente continuo con ponderación A ──────────────────────
    -- Promedio energético: 10 * log10(mean(10^(leq_dbfs/10)))
    leq_hour                DOUBLE PRECISION NOT NULL,

    -- ── Percentiles estándar acústicos (calculados sobre leq_dbfs) ───────
    -- L10: superado el 10% del tiempo → picos de ruido
    l10                     DOUBLE PRECISION NOT NULL,
    -- L50: superado el 50% del tiempo → nivel típico / mediana
    l50                     DOUBLE PRECISION NOT NULL,
    -- L90: superado el 90% del tiempo → ruido de fondo
    l90                     DOUBLE PRECISION NOT NULL,

    -- ── Estadísticas descriptivas del nivel global ────────────────────────
    dbfs_min                DOUBLE PRECISION NOT NULL,   -- Mínimo de dbfs_level
    dbfs_max                DOUBLE PRECISION NOT NULL,   -- Máximo de dbfs_level
    dbfs_avg                DOUBLE PRECISION NOT NULL,   -- Promedio aritmético de dbfs_level
    dbfs_stddev             DOUBLE PRECISION NOT NULL,   -- Desviación estándar

    -- ── Promedios de métricas espectrales ─────────────────────────────────
    avg_dominant_frequency  DOUBLE PRECISION NOT NULL,
    avg_spectral_centroid   DOUBLE PRECISION NOT NULL,
    avg_spectral_rolloff    DOUBLE PRECISION NOT NULL,
    avg_zero_crossing_rate  DOUBLE PRECISION NOT NULL,

    -- ── Promedios de métricas binaurales ──────────────────────────────────
    avg_ild_db              DOUBLE PRECISION NOT NULL,
    avg_interaural_corr     DOUBLE PRECISION NOT NULL,

    -- Timestamp de cuando el backend calculó esta agregación
    computed_at             TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    -- Restricción: solo puede existir una agregación por estación por hora
    CONSTRAINT uq_hourly_station_hour UNIQUE (station_id, hour_start)
);

COMMENT ON TABLE  hourly_aggregations               IS 'Estadísticas acústicas agregadas por hora. Calculadas por el Noise Processing Backend sobre acoustic_measurements. Consultadas principalmente por el dashboard.';
COMMENT ON COLUMN hourly_aggregations.hour_start    IS 'Inicio del período de una hora. Siempre truncado al inicio de la hora (minutos y segundos = 0).';
COMMENT ON COLUMN hourly_aggregations.leq_hour      IS 'Nivel equivalente continuo horario. Promedio energético de los leq_dbfs del período.';
COMMENT ON COLUMN hourly_aggregations.l10           IS 'Nivel superado el 10% del tiempo en la hora. Representa los eventos de mayor ruido.';
COMMENT ON COLUMN hourly_aggregations.l50           IS 'Nivel superado el 50% del tiempo en la hora. Nivel típico o mediana del período.';
COMMENT ON COLUMN hourly_aggregations.l90           IS 'Nivel superado el 90% del tiempo en la hora. Representa el ruido de fondo.';
COMMENT ON COLUMN hourly_aggregations.measurement_count IS 'Cantidad de registros de acoustic_measurements incluidos. Útil para detectar horas con datos incompletos.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_hourly_station_hour
    ON hourly_aggregations (station_id, hour_start DESC);

CREATE INDEX IF NOT EXISTS idx_hourly_hour_start
    ON hourly_aggregations (hour_start DESC);
