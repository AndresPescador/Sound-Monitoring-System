import { defaultT } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import ThemeToggle from '../shared/ThemeToggle'
import LanguageSwitcher from '../shared/LanguageSwitcher'

const navItems = (t = defaultT) => ([
  {
    to: '/admin/stations',
    label: t('admin.stations'),
    description: t('admin.network_status_and_credentials'),
  },
  {
    to: '/admin/profile',
    label: t('admin.my_profile'),
    description: t('admin.account_and_security'),
  },
])

export default function AdminLayout({ children }) {
  const { t } = useLanguage()
  const { user, logout } = useAdminAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/admin/login', { replace: true })
  }

  const roleLabel = user?.superAdmin ? t('admin.super_administrator') : t('admin.administrator')

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label={t('admin.administration_navigation')}>
        <Link
          to="/"
          className="admin-sidebar__brand"
          aria-label={t('admin.back_to_the_acoustic_monitoring_system_introduction')}
        >
          <img src="/assets/logo-oido-urbano.png" alt="" aria-hidden="true" />
          <span>{t('admin.acoustic_monitoring')}<small>{t('admin.network_operations')}</small>
          </span>
        </Link>

        <p className="admin-sidebar__context">{t('admin.administration_panel')}</p>

        <nav className="admin-nav" aria-label={t('admin.panel_sections')}>
          {navItems(t).map(({ to, label, description }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              )}
            >
              <span className="admin-nav__label">{t(label)}</span>
              <span className="admin-nav__description">{description}</span>
            </NavLink>
          ))}

          {user?.superAdmin && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) => (
                `admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`
              )}
            >
              <span className="admin-nav__label">{t('admin.administrators')}</span>
              <span className="admin-nav__description">{t('admin.team_access')}</span>
            </NavLink>
          )}
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-account">
            <div className="admin-account__meta">
              <div className="admin-account__name" title={user?.username}>{user?.username}</div>
              <div className="admin-account__role">{roleLabel}</div>
            </div>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <button type="button" onClick={handleLogout} className="admin-sidebar__logout">{t('admin.sign_out')}</button>
        </div>
      </aside>

      <main className="admin-main" id="main-content" tabIndex={-1}>
        <div className="admin-main__inner">{children}</div>
      </main>
    </div>
  )
}
