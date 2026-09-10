import { useLanguage } from '../../context/LanguageContext'
import { lazy, Suspense, useCallback } from 'react'
import { useMap3DContext } from '../../context/Map3DContext'

const OpenData = lazy(() => import('../../pages/OpenData'))

export default function Map3DDataRoute() {
  const { t } = useLanguage()
  const { focusStation } = useMap3DContext()
  const handleStationChange = useCallback((code) => focusStation(code), [focusStation])
  return (
    <Suspense fallback={<div className="map3d-dock-loading">{t('maps.loading_data_portal')}</div>}>
      <OpenData onStationChange={handleStationChange} embedded3D />
    </Suspense>
  )
}
