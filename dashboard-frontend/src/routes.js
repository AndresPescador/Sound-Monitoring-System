export const ROUTES = Object.freeze({
  landing: '/',
  map2D: '/mapa-2d',
  map2DCompare: '/mapa-2d/compare',
  map2DData: '/mapa-2d/data',
  map3D: '/mapa-3d',
})

export const map2DStationPath = (stationCode) => (
  `${ROUTES.map2D}/stations/${encodeURIComponent(stationCode)}`
)
