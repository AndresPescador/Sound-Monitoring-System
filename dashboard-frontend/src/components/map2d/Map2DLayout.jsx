import { useLanguage } from '../../context/LanguageContext'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ROUTES } from '../../routes'
import Map2DNavbar from './Map2DNavbar'

export default function Map2DLayout() {
  const { t } = useLanguage()
  const { pathname } = useLocation()
  const isMapHome = pathname === ROUTES.map2D

  return (
    <div className="dashboard-shell">
      <Map2DNavbar />
      <main id="main-content" className={`dashboard-main${isMapHome ? ' dashboard-main--map-home' : ''}`} tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="dashboard-footer">
        <span className="dashboard-footer__brand">{t('maps.acoustic_monitoring_2d_experience')}</span>
        <p className="dashboard-footer__copy">{t('maps.map_station_analysis_comparisons_and_open_data')}</p>
        <nav className="dashboard-footer__links" aria-label={t('maps.footer_links')}>
          <Link to={ROUTES.landing}>{t('maps.introduction')}</Link>
          <Link to={ROUTES.map2DData}>{t('maps.open_data')}</Link>
        </nav>
      </footer>
    </div>
  )
}
