import { defaultT } from '../../i18n/core.mjs'
/**
 * Descripciones no técnicas de cada métrica acústica.
 * Usadas en los tooltips de las gráficas.
 * Lenguaje formal pero sencillo, para personas no técnicas.
 */
export const METRIC_DESCRIPTIONS = (t = defaultT) => ({
  leq_dbfs: t('charts.a_weighted_continuous_equivalent_level_represents_the_noise_s'),

  dbfs_level: t('charts.overall_audio_signal_level_in_decibels_indicates_how_loud'),

  rms_energy: t('charts.average_audio_signal_energy_similar_to_the_dbfs_level'),

  ch_left_dbfs: t('charts.sound_level_recorded_by_the_station_s_left_ear'),

  ch_right_dbfs: t('charts.sound_level_recorded_by_the_station_s_right_ear'),

  ild_db: t('charts.interaural_level_difference_ild_indicates_which_side_the_dominant'),

  interaural_correlation: t('charts.correlation_between_the_two_microphones_left_and_right_ears'),

  dominant_frequency: t('charts.the_strongest_frequency_in_the_sound_during_the_period'),

  spectral_centroid: t('charts.the_sound_spectrum_s_center_of_gravity_in_hertz'),

  spectral_rolloff: t('charts.frequency_below_which_85_of_the_sound_energy_is'),

  zero_crossing_rate: t('charts.indicates_how_noisy_or_irregular_a_sound_is_high'),

  // Métricas de agregación horaria
  leq_hour: t('charts.a_weighted_continuous_equivalent_level_over_a_full_hour'),

  l10: t('charts.level_exceeded_during_10_of_the_hour_represents_noise'),

  l50: t('charts.level_exceeded_during_50_of_the_hour_it_is'),

  l90: t('charts.level_exceeded_during_90_of_the_hour_represents_background'),

  dbfs_min: t('charts.minimum_noise_level_recorded_during_the_period_indicates_the'),

  dbfs_max: t('charts.maximum_noise_level_recorded_during_the_period_indicates_the'),

  dbfs_avg: t('charts.average_level_of_all_measurements_during_the_period_provides'),

  measurement_count: t('charts.number_of_acoustic_measurements_recorded_during_the_period_a'),

  avg_spectral_centroid: t('charts.average_center_of_gravity_of_the_sound_spectrum_over'),

  avg_ild_db: t('charts.average_interaural_level_difference_over_the_period_indicates_which'),

  avg_interaural_corr: t('charts.average_correlation_between_the_two_microphones_over_the_period'),
})

/** 
 * Devuelve la descripción de una métrica o un texto genérico si no existe.
 * @param {string} metric - Clave de la métrica (ej: 'leq_dbfs', 'ild_db')
 * @returns {string} Descripción detallada de la métrica
 */
export const getMetricDescription = (metric, t = defaultT) =>
  METRIC_DESCRIPTIONS(t)[metric] ??
  t('charts.acoustic_metric_recorded_by_the_monitoring_station', { p0: metric })
