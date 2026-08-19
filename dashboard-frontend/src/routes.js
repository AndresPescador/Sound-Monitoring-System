export const ROUTES = Object.freeze({
  landing: '/',
  map2D: '/mapa-2d',
  map2DCompare: '/mapa-2d/compare',
  map2DData: '/mapa-2d/data',
  map3D: '/mapa-3d',
  map3DCompare: '/mapa-3d/compare',
  map3DData: '/mapa-3d/data',
})

export const map2DStationPath = (stationCode) => (
  `${ROUTES.map2D}/stations/${encodeURIComponent(stationCode)}`
)

export const map3DStationPath = (stationCode) => (
  `${ROUTES.map3D}/stations/${encodeURIComponent(stationCode)}`
)

export const map3DComparePath = () => ROUTES.map3DCompare

export const map3DDataPath = () => ROUTES.map3DData
