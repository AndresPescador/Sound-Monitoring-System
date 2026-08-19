import { useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { FlyToInterpolator } from '@deck.gl/core'
import { ColumnLayer, ScatterplotLayer } from '@deck.gl/layers'
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
  if (leq < -45) return [44, 216, 112, 220]
  if (leq < -35) return [0, 205, 222, 225]
  if (leq < -25) return [190, 47, 214, 235]
  return [238, 30, 65, 245]
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
    minzoom: 13,
    paint: {
      'fill-extrusion-color': '#c6cec8',
      'fill-extrusion-height': height,
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.82,
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
      'line-color': '#e11d48',
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
export default function NoiseTwinMap({
  stations = [],
  selectedStationCode,
  onSelectStation,
  columnRadius = 35,
  onSelectColumn,
}) {
  const [viewState, setViewState] = useState(BOGOTA_VIEW)

  const observedStations = useMemo(() => (
    stations.filter(s => (
      Number.isFinite(s.latitude) &&
      Number.isFinite(s.longitude) &&
      Number.isFinite(s.current_leq_dbfs)
    ))
  ), [stations])

  const selectedStation = useMemo(() => (
    observedStations.find(s => s.station_code === selectedStationCode)
  ), [observedStations, selectedStationCode])

  // La entrada conserva el encuadre de ciudad. Una selección acerca la cámara
  // de forma suave sin alterar el comportamiento al cargar el visor.
  useEffect(() => {
    if (!selectedStation) return
    setViewState(current => ({
      ...current,
      longitude: selectedStation.longitude,
      latitude: selectedStation.latitude,
      zoom: 15.8,
      pitch: 60,
      bearing: -15,
      transitionDuration: 1_100,
      transitionInterpolator: STATION_FLY_TO,
    }))
  }, [selectedStationCode, selectedStation?.latitude, selectedStation?.longitude])

  const layers = useMemo(() => [
    new ColumnLayer({
      id: 'noise-columns',
      data: observedStations,
      getPosition: d => [d.longitude, d.latitude],
      getFillColor: d => getNoiseColor(d.current_leq_dbfs),
      // -45 dBFS = 53 m, -30 dBFS = 105 m, -20 dBFS = 140 m.
      getElevation: d => Math.max(18, Math.min(160, (d.current_leq_dbfs + 60) * 3.5)),
      radius: columnRadius,
      diskResolution: 6,
      elevationScale: 1,
      pickable: true,
      updateTriggers: {
        getPosition: [observedStations],
        getFillColor: [observedStations],
        getElevation: [observedStations],
      },
      transitions: {
        getFillColor: 850,
        getElevation: 850,
      },
      onClick: info => {
        if (!info.object) return
        onSelectColumn?.({
          stationCode: info.object.station_code,
          leqDbfs: info.object.current_leq_dbfs,
          elevationValue: Math.max(18, Math.min(160, (info.object.current_leq_dbfs + 60) * 3.5)),
        })
        onSelectStation?.(info.object.station_code)
      },
    }),
    new ScatterplotLayer({
      id: 'stations-points',
      data: observedStations,
      getPosition: d => [d.longitude, d.latitude],
      getRadius: d => d.station_code === selectedStationCode ? 34 : 24,
      radiusUnits: 'meters',
      radiusMinPixels: 5,
      radiusMaxPixels: 16,
      getFillColor: d => getNoiseColor(d.current_leq_dbfs),
      getLineColor: d => d.station_code === selectedStationCode ? [15, 23, 42, 255] : [255, 255, 255, 235],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      updateTriggers: {
        getRadius: [selectedStationCode],
        getFillColor: [observedStations],
      },
      transitions: {
        getRadius: 450,
        getFillColor: 850,
      },
      onClick: info => info.object && onSelectStation?.(info.object.station_code),
    }),
  ], [columnRadius, observedStations, onSelectColumn, onSelectStation, selectedStationCode])

  const resetToCityView = () => {
    setViewState(current => ({
      ...current,
      ...BOGOTA_VIEW,
      transitionDuration: 900,
      transitionInterpolator: STATION_FLY_TO,
    }))
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-slate-900">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: nextViewState }) => setViewState(nextViewState)}
        controller={{ dragRotate: true, touchRotate: true, keyboard: true }}
        layers={layers}
        getTooltip={({ object, layer }) => {
          if (!object) return null
          if (layer?.id === 'stations-points') {
            return {
              text: `${object.name}\n${object.current_leq_dbfs.toFixed(1)} dBFS · ${object.locality}`,
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
          mapLib={maplibregl}
          mapStyle={MAP_STYLE}
          reuseMaps
          onLoad={event => {
            addBuildingExtrusions(event.target)
            addBogotaBoundary(event.target)
          }}
        />
      </DeckGL>

      <div className="absolute bottom-3 left-3 rounded-md border border-white/20 bg-slate-950/85 px-3 py-2 text-xs text-slate-100 shadow-lg">
        <p className="font-display font-semibold">Columnas por estación</p>
        <p className="mt-0.5 text-slate-300">Altura = intensidad relativa de Leq</p>
        <p className="mt-1 text-[10px] text-slate-400">Límite: IDECA · Base © OpenStreetMap · CARTO</p>
      </div>

      <button
        type="button"
        onClick={resetToCityView}
        className="absolute left-3 top-32 rounded-md border border-slate-300 bg-white/95 px-3 py-2 text-xs font-display font-semibold text-slate-700 shadow-lg transition-colors hover:border-primary hover:text-primary"
      >
        Vista general
      </button>
    </div>
  )
}
