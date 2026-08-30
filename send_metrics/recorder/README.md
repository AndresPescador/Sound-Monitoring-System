# Grabador continuo de terminal

`continuous-recorder` reemplaza la parte de captura de la aplicación JUCE. Solo captura y publica WAV: el análisis y el envío siguen siendo responsabilidad de `../scripts/process_audio.py` y `../scripts/send_metrics.py`.

La guía operativa de la estación está en el [README del componente padre](../README.md).

## Formato y comportamiento

- Linux/Raspberry Pi, ALSA, C++17.
- Por defecto: 44.100 Hz, hasta estéreo, WAV PCM little-endian de 24 bits.
- Segmentos de 60 segundos encadenados sin pausa deliberada.
- Los archivos se escriben como `.wav.part` y se renombran a `.wav` únicamente después de cerrar y sincronizar el archivo. Así `process_audio.py --watch` nunca debe leer un WAV aún abierto.
- Cada nombre publicado comienza con `Rec AAAA-MM-DD HHhMMmSS 1.wav`, que es compatible con el extractor de timestamp actual. Una colisión añade ` (2)`, ` (3)`, etc., sin sobrescribir audio.

## Instalación integrada

En una estación use el instalador principal. Compila este binario, prepara la configuración compartida y registra el servicio:

```bash
cd send_metrics
./setup/install_station.sh
```

La TUI selecciona el dispositivo ALSA y guarda la configuración en `~/.config/sound-monitor/station.toml`. El grabador ignora las claves de identidad y envío del mismo archivo.

## Compilación manual para desarrollo

En Raspberry Pi OS/Debian:

```bash
sudo apt update
sudo apt install -y build-essential cmake pkg-config libasound2-dev libsndfile1-dev libtomlplusplus-dev
cmake -S send_metrics/recorder -B send_metrics/recorder/build -DCMAKE_BUILD_TYPE=Release
cmake --build send_metrics/recorder/build --parallel
sudo cmake --install send_metrics/recorder/build
```

El compilador requiere las cabeceras ALSA, libsndfile y toml++. No se necesitan dependencias Python para el binario.

## Configurar la fuente de captura

El programa no elige una fuente automática en producción. Primero enumere ALSA:

```bash
continuous-recorder devices --json
```

Copie el valor `device` de la entrada elegida al TOML. Para una compilación independiente puede usar el ejemplo del componente:

```bash
cp send_metrics/recorder/config/recorder.example.toml /tmp/recorder.toml
continuous-recorder validate-config --config /tmp/recorder.toml
```

`channels = "auto"` intenta estéreo y, si el dispositivo solo ofrece una entrada, usa mono. `channels = "stereo"` falla en lugar de degradar a mono.

`validate-config` crea las carpetas configuradas si faltan y comprueba escritura y negociación con ALSA, pero no graba audio.

## Uso y operación

Para una prueba en primer plano:

```bash
continuous-recorder record --config ~/.config/sound-monitor/station.toml
continuous-recorder status --config ~/.config/sound-monitor/station.toml
```

`Ctrl+C` y `SIGTERM` cierran el segmento parcial y lo publican. El archivo de estado JSON se actualiza atómicamente; `--json` emite el mismo contrato que consume la TUI.

Con la instalación integrada, el estado completo también está disponible en `sound-monitor`. Para desarrollo, ejecute en paralelo el procesador existente apuntando a la misma carpeta:

```bash
python scripts/process_audio.py --watch --folder /home/pi/grabaciones --output ./runtime/audio_stats
```

## Pruebas

```bash
cmake -S send_metrics/recorder -B send_metrics/recorder/build -DBUILD_TESTING=ON
cmake --build send_metrics/recorder/build --parallel
ctest --test-dir send_metrics/recorder/build --output-on-failure
```

Las pruebas de contrato no requieren hardware de audio. La validación de un dispositivo y la prueba de captura requieren el micrófono real de la estación.
