import { lazy, Suspense, useCallback } from 'react'
import { useMap3DContext } from '../../context/Map3DContext'

const Compare = lazy(() => import('../../pages/Compare'))

export default function Map3DCompareRoute() {
  const { focusStations } = useMap3DContext()
  const handleSelectionChange = useCallback((codes) => focusStations(codes), [focusStations])
  return (
    <Suspense fallback={<div className="map3d-dock-loading">Cargando controles comparativos…</div>}>
      <Compare onStationSelectionChange={handleSelectionChange} />
    </Suspense>
  )
}
