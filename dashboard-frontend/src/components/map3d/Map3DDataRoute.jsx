import { lazy, Suspense, useCallback } from 'react'
import { useMap3DContext } from '../../context/Map3DContext'

const OpenData = lazy(() => import('../../pages/OpenData'))

export default function Map3DDataRoute() {
  const { focusStation } = useMap3DContext()
  const handleStationChange = useCallback((code) => focusStation(code), [focusStation])
  return (
    <Suspense fallback={<div className="map3d-dock-loading">Cargando portal de datos…</div>}>
      <OpenData onStationChange={handleStationChange} />
    </Suspense>
  )
}
