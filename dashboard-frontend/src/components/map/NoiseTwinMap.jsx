import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { FlyToInterpolator } from '@deck.gl/core'
import { ColumnLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import Map from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const BOGOTA_VIEW = {
  // Encuadre inicial cenital, similar a un mapa base convencional.
  longitude: -74.132,
  latitude: 4.655,
  zoom: 11.3,
  pitch: 0,
  bearing: 0,
}

const BOGOTA_3D_VIEW = {
  ...BOGOTA_VIEW,
  pitch: 60,
  bearing: -15,
}

const STATION_FLY_TO = new FlyToInterpolator({ speed: 1.7 })

const BUILDINGS_LAYER_ID = 'urban-buildings-3d'
const BUILDING_HEIGHT_MULTIPLIER = 1.6
const BOGOTA_BOUNDARY_SOURCE_ID = 'bogota-administrative-boundary'
const BOGOTA_BOUNDARY_LAYER_ID = 'bogota-administrative-boundary-line'
// Límite municipal oficial IDECA (CC BY 4.0), descargado como recurso estático
// para evitar que las restricciones CORS del portal afecten al visor.
const BOGOTA_BOUNDARY_URL = '/bogota-municipio.geojson'

// CARTO Positron es público y mantiene la apariencia clara si no se configura
// MapTiler. Para una cartografía de producción, defina VITE_MAPTILER_KEY.
const MAP_STYLE = import.meta.env.VITE_MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2-light/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`
  : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

function getNoiseColor(leq) {
  if (leq < -30) return [22, 163, 74, 225]
  if (leq < -20) return [217, 119, 6, 230]
  return [220, 38, 38, 240]
}

function getStationColor(leq, highlighted = true) {
  if (!highlighted) return [100, 116, 139, 80]
  return Number.isFinite(leq) ? getNoiseColor(leq) : [100, 116, 139, 210]
}

/** Agrega edificios 3D cuando el estilo vectorial expone source-layer "building". */
function addBuildingExtrusions(map) {
  if (map.getLayer(BUILDINGS_LAYER_ID)) return

  const styleLayers = map.getStyle()?.layers ?? []
  const buildings = styleLayers.find(layer => (
    layer.type === 'fill' && layer['source-layer'] === 'building' && layer.source
  ))
  if (!buildings) return

  // Las etiquetas permanecen por encima de la masa urbana.
  const firstLabel = styleLayers.find(layer => layer.type === 'symbol')?.id
  // Exageración visual moderada para reforzar la lectura 3D sin cambiar datos.
  const height = [
    '*',
    BUILDING_HEIGHT_MULTIPLIER,
    ['to-number', ['get', 'render_height'], ['get', 'height'], 9],
  ]

  map.addLayer({
    id: BUILDINGS_LAYER_ID,
    type: 'fill-extrusion',
    source: buildings.source,
    'source-layer': buildings['source-layer'],
    // Se muestran desde la vista urbana general para conservar la lectura 3D.
    minzoom: 11,
    paint: {
      // Tonos cálidos inspirados en visores de planeación urbana.
      'fill-extrusion-color': '#18345e',
      'fill-extrusion-height': height,
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.88,
    },
  }, firstLabel)
}

function addBogotaBoundary(map) {
  if (map.getLayer(BOGOTA_BOUNDARY_LAYER_ID)) return

  map.addSource(BOGOTA_BOUNDARY_SOURCE_ID, {
    type: 'geojson',
    data: BOGOTA_BOUNDARY_URL,
  })
  map.addLayer({
    id: BOGOTA_BOUNDARY_LAYER_ID,
    type: 'line',
    source: BOGOTA_BOUNDARY_SOURCE_ID,
    paint: {
      'line-color': '#60a5fa',
      'line-width': 2.5,
      'line-opacity': 0.9,
      'line-dasharray': [2, 2],
    },
  })
}

/**
 * Cada columna hexagonal se ancla exactamente a la coordenada de la estación.
 * La altura normaliza dBFS frente a un piso de -60 dBFS: no representa edificios
 * ni metros acústicos reales, sino una intensidad relativa fácil de comparar.
 */
function NoiseTwinMap({
  stations = [],
  selectedStationCode,
  highlightedStationCodes = [],
  hoveredStationCode,
  onSelectStation,
  onStationScreenPosition,
  columnRadius = 35,
}) {
  const [cameraTarget, setCameraTarget] = useState(null)
  const mapRef = useRef(null)

  const observedStations = useMemo(() => (
    stations.filter(s => (
      Number.isFinite(s.latitude) &&
      Number.isFinite(s.longitude) &&
      Number.isFinite(s.current_leq_dbfs)
    ))
  ), [stations])

  const locatedStations = useMemo(() => (
    stations.filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
  ), [stations])

  const selectedStation = useMemo(() => (
    locatedStations.find(s => s.station_code === selectedStationCode)
  ), [locatedStations, selectedStationCode])

  const hoveredStation = useMemo(() => (
    locatedStations.find(s => s.station_code === hoveredStationCode)
  ), [hoveredStationCode, locatedStations])

  const highlightedKey = highlightedStationCodes.join('|')
  const highlightedSet = useMemo(() => new Set(highlightedStationCodes), [highlightedKey])

  const reportSelectedPosition = useCallback(() => {
    if (!onStationScreenPosition) return
    if (!selectedStation) {
      onStationScreenPosition(null)
      return
    }
    const map = mapRef.current
    if (!map) return
    const point = map.project([selectedStation.longitude, selectedStation.latitude])
    onStationScreenPosition({ x: point.x, y: point.y })
  }, [onStationScreenPosition, selectedStation])

  useEffect(() => {
    reportSelectedPosition()
    if (!selectedStation) return undefined
    const timeoutId = window.setTimeout(reportSelectedPosition, 1_250)
    return () => window.clearTimeout(timeoutId)
  }, [reportSelectedPosition])

  // El mapa usa el seguimiento interno de initialViewState para que los gestos
  // no provoquen un setState React por frame. Solo cambiamos la cámara cuando
  // una acción explícita selecciona o restablece una estación.
  useEffect(() => {
    if (selectedStation) {
      setCameraTarget({
        longitude: selectedStation.longitude,
        latitude: selectedStation.latitude,
        zoom: 15.8,
        pitch: 60,
        bearing: -15,
        transitionDuration: 1_100,
        transitionInterpolator: STATION_FLY_TO,
      })
      return
    }
    setCameraTarget({ ...BOGOTA_VIEW, transitionDuration: 700, transitionInterpolator: STATION_FLY_TO })
  }, [selectedStationCode, selectedStation?.latitude, selectedStation?.longitude])

  const handleSelect = useCallback(info => {
    if (info.object) onSelectStation?.(info.object.station_code)
  }, [onSelectStation])

  const layers = useMemo(() => [
    new ColumnLayer({
      id: 'noise-columns',
      data: observedStations,
      getPosition: d => [d.longitude, d.latitude],
      getFillColor: d => getStationColor(d.current_leq_dbfs, !highlightedStationCodes.length || highlightedSet.has(d.station_code)),
      // -45 dBFS = 53 m, -30 dBFS = 105 m, -20 dBFS = 140 m.
      getElevation: d => Math.max(18, Math.min(160, (d.current_leq_dbfs + 60) * 3.5)),
      radius: columnRadius,
      diskResolution: 6,
      elevationScale: 1,
      pickable: true,
      updateTriggers: {
        getPosition: [observedStations],
        getFillColor: [observedStations, highlightedKey],
        getElevation: [observedStations],
      },
      transitions: {
        getFillColor: 850,
        getElevation: 850,
      },
      onClick: handleSelect,
    }),
    new ScatterplotLayer({
      id: 'stations-points',
      data: locatedStations,
      getPosition: d => [d.longitude, d.latitude],
      getRadius: d => d.station_code === selectedStationCode ? 34 : 24,
      radiusUnits: 'meters',
      radiusMinPixels: 5,
      radiusMaxPixels: 16,
      getFillColor: d => getStationColor(d.current_leq_dbfs, !highlightedStationCodes.length || highlightedSet.has(d.station_code)),
      getLineColor: d => d.station_code === selectedStationCode ? [15, 23, 42, 255] : [255, 255, 255, 235],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      updateTriggers: {
        getRadius: [selectedStationCode],
        getFillColor: [locatedStations, highlightedKey],
      },
      transitions: {
        getRadius: 450,
        getFillColor: 850,
      },
      onClick: handleSelect,
    }),
    new ScatterplotLayer({
      id: 'station-hover-ring',
      data: hoveredStation ? [hoveredStation] : [],
      getPosition: d => [d.longitude, d.latitude],
      getRadius: 46,
      radiusUnits: 'meters',
      radiusMinPixels: 9,
      radiusMaxPixels: 20,
      getFillColor: [255, 255, 255, 0],
      getLineColor: [15, 23, 42, 255],
      lineWidthMinPixels: 2,
      stroked: true,
      pickable: false,
      parameters: { depthTest: false },
    }),
    new TextLayer({
      id: 'station-hover-label',
      data: hoveredStation ? [hoveredStation] : [],
      getPosition: d => [d.longitude, d.latitude],
      getText: d => `${d.name}\nLeq: ${Number.isFinite(d.current_leq_dbfs) ? `${d.current_leq_dbfs.toFixed(1)} dBFS` : 'sin dato reciente'}`,
      getColor: [241, 245, 249, 255],
      getSize: 14,
      sizeUnits: 'pixels',
      sizeMinPixels: 12,
      billboard: true,
      background: true,
      getBackgroundColor: [15, 23, 42, 235],
      backgroundPadding: [10, 7],
      backgroundBorderRadius: 5,
      getPixelOffset: [52, 0],
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      fontFamily: 'DM Sans, sans-serif',
      fontWeight: 600,
      characterSet: 'auto',
      maxWidth: 260,
      pickable: false,
      parameters: { depthTest: false },
    }),
  ], [columnRadius, handleSelect, highlightedKey, highlightedSet, hoveredStation, locatedStations, observedStations, selectedStationCode])

  const resetToCityView = () => {
    setCameraTarget({ ...BOGOTA_VIEW, transitionDuration: 900, transitionInterpolator: STATION_FLY_TO })
  }

  const resetTo3dView = () => {
    setCameraTarget({ ...BOGOTA_3D_VIEW, transitionDuration: 900, transitionInterpolator: STATION_FLY_TO })
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-slate-900" onContextMenu={event => event.preventDefault()}>
      <DeckGL
        initialViewState={cameraTarget ?? BOGOTA_VIEW}
        controller={{ dragPan: true, dragRotate: true, touchRotate: true, keyboard: true, maxPitch: 85 }}
        layers={layers}
        onInteractionStateChange={({ interactionState }) => {
          if (!interactionState?.isDragging && !interactionState?.isPanning && !interactionState?.isRotating && !interactionState?.isZooming) {
            window.requestAnimationFrame(reportSelectedPosition)
          }
        }}
        getTooltip={({ object, layer }) => {
          if (!object) return null
          if (layer?.id === 'stations-points') {
            return {
              text: `${object.name}\n${object.current_leq_dbfs != null ? `${object.current_leq_dbfs.toFixed(1)} dBFS` : 'Sin dato reciente'} · ${object.locality}`,
            }
          }
          if (layer?.id === 'noise-columns') {
            return {
              text: `${object.name}\nLeq: ${object.current_leq_dbfs.toFixed(1)} dBFS`,
            }
          }
          return null
        }}
      >
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          mapStyle={MAP_STYLE}
          reuseMaps
          dragRotate
          maxPitch={85}
          onLoad={event => {
            addBuildingExtrusions(event.target)
            addBogotaBoundary(event.target)
            window.requestAnimationFrame(reportSelectedPosition)
          }}
          onMoveEnd={() => window.requestAnimationFrame(reportSelectedPosition)}
        />
      </DeckGL>

      <div className="map3d-noise-legend" aria-label="Leyenda de nivel acústico relativo">
        <span className="map3d-noise-legend__title">Nivel relativo · Leq</span>
        <div className="map3d-noise-legend__items">
          <span><i className="map3d-level-dot is-low" aria-hidden="true" />Bajo</span>
          <span><i className="map3d-level-dot is-medium" aria-hidden="true" />Medio</span>
          <span><i className="map3d-level-dot is-high" aria-hidden="true" />Alto</span>
        </div>
        <small>La altura compara intensidad; no representa metros reales.</small>
      </div>

      <div className="map3d-map-controls">
        <button
          type="button"
          onClick={resetToCityView}
          className="pointer-events-auto min-h-11 whitespace-nowrap rounded-md border border-slate-300 bg-white/95 px-3 py-2 text-xs font-display font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          Vista general
        </button>
        <button
          type="button"
          onClick={resetTo3dView}
          className="pointer-events-auto min-h-11 whitespace-nowrap rounded-md border border-slate-300 bg-white/95 px-3 py-2 text-xs font-display font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          Restablecer ángulo
        </button>
      </div>
    </div>
  )
}

export default memo(NoiseTwinMap)
