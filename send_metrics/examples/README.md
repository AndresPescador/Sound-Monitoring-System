# Lote de métricas de prueba

Genera archivos `.txt` con el mismo JSON que publica `process_audio.py`, más
su `index.json`, usando sólo la biblioteca estándar de Python.

```bash
python examples/generate_sample_metrics.py --count 24
```

Por defecto crea el lote en `examples/audio_stats/`. Para generar datos en una
carpeta de pruebas de la Raspberry:

```bash
python examples/generate_sample_metrics.py \
  --count 24 \
  --output /tmp/audio_stats_prueba
```

No incluye `stationCode`, tokens ni secretos: `send_metrics.py` añade el código
de estación configurado al enviar. No copies un `index.json` de prueba sobre la
cola de una estación que esté operando.

Estos archivos son adecuados únicamente para pruebas locales; para instalar una
estación consulta el [README de send_metrics](../README.md).
