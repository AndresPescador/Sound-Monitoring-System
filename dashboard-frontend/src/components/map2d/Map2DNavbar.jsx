import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { Link, useLocation } from 'react-router-dom'
import { ROUTES } from '../../routes'
import ThemeToggle from '../shared/ThemeToggle'
import LanguageSwitcher from '../shared/LanguageSwitcher'

const links = (t = defaultT) => ([
  { to: ROUTES.map2D, label: t('maps.map'), end: true },
  { to: ROUTES.map2DCompare, label: t('maps.compare_stations') },
  { to: ROUTES.map2DData, label: t('maps.open_data') },
])

export default function Map2DNavbar() {
  const { t } = useLanguage()
  const { pathname } = useLocation()
  const isActive = to => to === ROUTES.map2D
    ? pathname === ROUTES.map2D || pathname.startsWith(`${ROUTES.map2D}/stations/`)
    : pathname === to

  return (
    <header className="dashboard-nav">
      <div className="dashboard-nav__inner">
        <Link to={ROUTES.landing} className="dashboard-nav__brand" aria-label={t('admin.back_to_the_acoustic_monitoring_system_introduction')}>
          <img
            className="dashboard-nav__mark"
            src="/assets/logo-oido-urbano.png"
            alt=""
            aria-hidden="true"
          />
          <span>{t('admin.acoustic_monitoring')}<small>{t('maps.2d_experience')}</small></span>
        </Link>

        <nav className="dashboard-nav__links" aria-label={t('maps.2d_map_tools')}>
          {links(t).map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`dashboard-nav__link ${isActive(to) ? 'dashboard-nav__link--active' : ''}`}
              aria-current={isActive(to) ? 'page' : undefined}
            >
              {t(label)}
            </Link>
          ))}
        </nav>

        <div className="dashboard-nav__actions">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link to={ROUTES.map3D} className="dashboard-nav__mode-switch">{t('maps.switch_to_3d_map')}</Link>
        </div>
      </div>
    </header>
  )
}
