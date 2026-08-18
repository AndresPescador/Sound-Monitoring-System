import { useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { HexagonLayer } from '@deck.gl/aggregation-layers'
import { ScatterplotLayer } from '@deck.gl/layers'
import Map from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const BOGOTA_VIEW = {
  longitude: -74.0721,
  latitude: 4.6097,
  zoom: 14.5,
  pitch: 55,
  bearing: -15,
}

const BUILDINGS_LAYER_ID = 'urban-buildings-3d'

// CARTO Positron es público y mantiene la apariencia clara si no se configura
// MapTiler. Para una cartografía de producción, defina VITE_MAPTILER_KEY.
const MAP_STYLE = import.meta.env.VITE_MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2-light/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`
  : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

const COLOR_RANGE = [
  [44, 216, 112, 210],
  [0, 205, 222, 220],
  [190, 47, 214, 230],
  [238, 30, 65, 245],
]

const NOISE_COLOR = {
  low: [22, 163, 74, 255],
  moderate: [217, 119, 6, 255],
  high: [220, 38, 38, 255],
}

const toEnergy = (leq) => Math.pow(10, leq / 10)
const toDbfs = (energy) => energy > 0 ? 10 * Math.log10(energy) : null

function getEnergyDomain(stations) {
  const values = stations.map(s => toEnergy(s.current_leq_dbfs))
  const min = Math.min(...values)
  const max = Math.max(...values)

  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0.000001, 0.1]
  if (min === max) return [min * 0.85, max * 1.15]
  return [min, max]
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
  const height = ['to-number', ['get', 'render_height'], ['get', 'height'], 9]

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

/**
 * Visor urbano 3D. El color usa promedio energético de Leq por hexágono;
 * mientras no exista peak_event_count, la altura representa intensidad media.
 */
export default function NoiseTwinMap({
  stations = [],
  selectedStationCode,
  onSelectStation,
  hexRadius = 75,
  onSelectHex,
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

  const energyDomain = useMemo(() => getEnergyDomain(observedStations), [observedStations])

  useEffect(() => {
    if (!selectedStation) return
    setViewState(current => ({
      ...current,
      longitude: selectedStation.longitude,
      latitude: selectedStation.latitude,
      zoom: Math.max(current.zoom, 13.5),
      transitionDuration: 650,
    }))
  }, [selectedStationCode, selectedStation?.latitude, selectedStation?.longitude])

  const layers = useMemo(() => [
    new HexagonLayer({
      id: 'noise-hexagons',
      data: observedStations,
      getPosition: d => [d.longitude, d.latitude],
      // Leq se promedia como energía, no como decibelio aritmético.
      getColorWeight: d => toEnergy(d.current_leq_dbfs),
      colorAggregation: 'MEAN',
      colorDomain: energyDomain,
      colorRange: COLOR_RANGE,
      // Sustituir por SUM(peak_event_count) cuando esa métrica exista.
      getElevationWeight: d => toEnergy(d.current_leq_dbfs),
      elevationAggregation: 'MEAN',
      elevationScale: 10_000_000,
      elevationRange: [0, 260],
      radius: hexRadius,
      coverage: 0.85,
      extruded: true,
      gpuAggregation: true,
      pickable: true,
      updateTriggers: {
        getPosition: [observedStations],
        getColorWeight: [observedStations],
        getElevationWeight: [observedStations],
      },
      transitions: {
        getColorWeight: 850,
        getElevationWeight: 850,
      },
      onClick: info => {
        if (!info.object) return
        onSelectHex?.({
          count: info.object.count,
          leqDbfs: toDbfs(info.object.colorValue),
          elevationValue: info.object.elevationValue,
        })
      },
    }),
    new ScatterplotLayer({
      id: 'stations-points',
      data: observedStations,
      getPosition: d => [d.longitude, d.latitude],
      getRadius: d => d.station_code === selectedStationCode ? 88 : 52,
      radiusUnits: 'meters',
      radiusMinPixels: 5,
      radiusMaxPixels: 16,
      getFillColor: d => NOISE_COLOR[d.noise_level] ?? [100, 116, 139, 255],
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
  ], [energyDomain, hexRadius, observedStations, onSelectHex, onSelectStation, selectedStationCode])

  return (
    <div className="relative h-full min-h-[540px] overflow-hidden bg-slate-900">
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
          if (layer?.id === 'noise-hexagons') {
            const leq = toDbfs(object.colorValue)
            return {
              text: `${object.count} estación${object.count === 1 ? '' : 'es'}\nLeq energético: ${leq?.toFixed(1) ?? '—'} dBFS`,
            }
          }
          return null
        }}
      >
        <Map
          mapLib={maplibregl}
          mapStyle={MAP_STYLE}
          reuseMaps
          onLoad={event => addBuildingExtrusions(event.target)}
        />
      </DeckGL>

      <div className="absolute bottom-3 left-3 rounded-md border border-white/20 bg-slate-950/85 px-3 py-2 text-xs text-slate-100 shadow-lg">
        <p className="font-display font-semibold">Leq energético por hexágono</p>
        <p className="mt-0.5 text-slate-300">Altura = intensidad media provisional</p>
        <p className="mt-1 text-[10px] text-slate-400">Base © OpenStreetMap · CARTO</p>
      </div>
    </div>
  )
}
