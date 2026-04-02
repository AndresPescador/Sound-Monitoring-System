/**
 * Descripciones no técnicas de cada métrica acústica.
 * Usadas en los tooltips de las gráficas.
 * Lenguaje formal pero sencillo, para personas no técnicas.
 */
export const METRIC_DESCRIPTIONS = {
  leq_dbfs: `Nivel equivalente continuo con ponderación A. Representa el "promedio energético" del ruido durante el período, ajustado según cómo lo percibe el oído humano. Valores más cercanos a 0 dBFS indican mayor nivel de ruido. Es el indicador estándar usado en normativas internacionales de ruido ambiental.`,

  dbfs_level: `Nivel general de la señal de audio en decibelios. Indica qué tan fuerte fue el sonido capturado en ese momento. Un valor de −60 dBFS es muy silencioso; un valor de −10 dBFS es muy ruidoso. Permite ver las variaciones instantáneas del ruido.`,

  rms_energy: `Energía promedio de la señal de audio. Es similar al nivel dBFS pero expresado en escala lineal (0 a 1). Valores más altos significan más energía sonora acumulada en el ambiente. Útil para detectar períodos de alta actividad sonora.`,

  ch_left_dbfs: `Nivel de sonido registrado por el micrófono del oído izquierdo de la estación. Permite comparar la intensidad del sonido que proviene de cada lado y detectar si hay más ruido de un lado que del otro.`,

  ch_right_dbfs: `Nivel de sonido registrado por el micrófono del oído derecho de la estación. Permite comparar la intensidad del sonido entre ambos lados y ayuda a localizar dónde predomina el ruido.`,

  ild_db: `Diferencia de nivel interaural (ILD). Indica de qué lado viene el ruido predominante. Un valor positivo significa que el sonido viene más del lado izquierdo; un valor negativo, del derecho. Un valor cercano a cero indica que el ruido rodea la estación de forma uniforme, como el tráfico general.`,

  interaural_correlation: `Correlación entre los dos micrófonos (oído izquierdo y derecho). Un valor cercano a 1 indica que el sonido llega de frente o rodea la estación de manera uniforme, como el ruido de tráfico difuso. Un valor cercano a 0 indica una fuente sonora claramente ubicada a un solo lado.`,

  dominant_frequency: `Frecuencia más intensa en el sonido durante ese período, expresada en Hertz (Hz). Frecuencias bajas (< 300 Hz) corresponden a graves como motores o maquinaria pesada; frecuencias altas (> 2000 Hz) corresponden a agudos como bocinas o voces. Ayuda a identificar el tipo de ruido predominante.`,

  spectral_centroid: `"Centro de gravedad" del espectro sonoro, en Hertz (Hz). Valores bajos (< 500 Hz) indican que predominan los graves, como el sonido de camiones o maquinaria. Valores altos (> 2000 Hz) indican un sonido más agudo y brillante, como voces o alarmas de seguridad.`,

  spectral_rolloff: `Frecuencia por debajo de la cual se concentra el 85% de la energía sonora. Ayuda a identificar si el ambiente tiene sonidos graves o agudos como predominantes. Valores bajos indican ambientes con mucha energía en graves; valores altos indican mayor presencia de agudos.`,

  zero_crossing_rate: `Indica qué tan "ruidoso" o irregular es el sonido. Valores altos sugieren ruido caótico o sin tono definido, como estática o lluvia. Valores bajos indican sonidos más tonales o constantes, como un motor a régimen fijo o una nota musical sostenida.`,

  // Métricas de agregación horaria
  leq_hour: `Nivel equivalente continuo durante una hora completa, con ponderación A. Es el indicador estándar de ruido ambiental usado en normativas internacionales. Permite comparar el nivel de ruido entre diferentes horas del día e identificar patrones de ruido.`,

  l10: `Nivel superado durante el 10% del tiempo en esa hora. Representa los picos de ruido: eventos ocasionales como bocinas, frenadas o gritos. Es un indicador de los momentos más ruidosos y permite medir la variabilidad del ruido.`,

  l50: `Nivel superado durante el 50% del tiempo en esa hora. Es el nivel "típico" o mediana del período. Representa el ruido que estuvo presente la mayor parte del tiempo y da una idea del ruido más frecuente.`,

  l90: `Nivel superado durante el 90% del tiempo en esa hora. Representa el ruido de fondo: el nivel mínimo que casi siempre estuvo presente, como el sonido constante del tráfico lejano o el viento. Indica el ruido base del ambiente.`,

  dbfs_min: `Nivel mínimo de ruido registrado durante ese período. Indica el sonido más silencioso capturado. Un valor bajo muestra que hubo momentos muy tranquilos.`,

  dbfs_max: `Nivel máximo de ruido registrado durante ese período. Indica el sonido más fuerte capturado. Un valor alto muestra que hubo eventos o picos de ruido significativos.`,

  dbfs_avg: `Nivel promedio de todas las mediciones durante ese período. Proporciona una visión general del ruido típico, siendo una medida más simple que el Leq.`,

  measurement_count: `Cantidad de mediciones acústicas registradas durante ese período. Un número alto indica que el sistema estuvo activo y recolectando datos continuamente.`,

  avg_spectral_centroid: `"Centro de gravedad" promedio del espectro sonoro durante el período, en Hertz (Hz). Valores bajos (< 500 Hz) indican que predominan los sonidos graves como camiones o maquinaria pesada. Valores altos (> 2000 Hz) indican sonidos más agudos y brillantes como voces o alarmas.`,

  avg_ild_db: `Diferencia de nivel interaural promedio durante el período. Indica de qué lado viene el ruido predominante. Un valor positivo significa que el sonido viene más del lado izquierdo; un valor negativo, del derecho. Un valor cercano a cero indica que el ruido rodea la estación de forma uniforme.`,

  avg_interaural_corr: `Correlación promedio entre los dos micrófonos durante el período. Un valor cercano a 1 indica que el sonido llega de forma uniforme o difusa. Un valor cercano a 0 indica una fuente sonora claramente ubicada a un solo lado.`,
}

/** 
 * Devuelve la descripción de una métrica o un texto genérico si no existe.
 * @param {string} metric - Clave de la métrica (ej: 'leq_dbfs', 'ild_db')
 * @returns {string} Descripción detallada de la métrica
 */
export const getMetricDescription = (metric) =>
  METRIC_DESCRIPTIONS[metric] ??
  `Métrica acústica "${metric}" registrada por la estación de monitoreo.`