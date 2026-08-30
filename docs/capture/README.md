# Capturas públicas del dashboard

Las imágenes en `docs/media/dashboard/` son demostraciones visuales del
producto. Se capturan exclusivamente con estaciones y métricas sintéticas.

## Reglas de seguridad

- No usar el despliegue de producción ni sus volúmenes, redes o credenciales.
- No copiar, leer ni versionar archivos `.env`, tokens, secrets de estación,
  contraseñas ni datos de usuarios.
- Crear una copia efímera desde archivos versionados y usar un proyecto Docker
  exclusivo, por ejemplo `sms-docs-capture`.
- Cambiar el puerto del gateway a loopback y usar una subred privada libre para
  no interferir con otros proyectos Docker.
- Destruir únicamente los recursos de ese proyecto al finalizar:
  `docker compose -p sms-docs-capture down --volumes --remove-orphans`.
  Nunca ejecutar limpiezas globales de Docker.

## Conjunto actual

Las cuatro vistas requeridas son:

1. `mapa-2d-red-estaciones.png`: red de estaciones y resumen.
2. `detalle-estacion.png`: series y agregaciones de una estación.
3. `comparacion-estaciones.png`: curvas comparativas entre localidades.
4. `mapa-3d-red-acustica.png`: visualización urbana 3D de una estación.

Antes de publicar, revisar que las imágenes muestren una fuente de datos
sintética, no contengan credenciales y representen una interfaz cargada sin
errores.
