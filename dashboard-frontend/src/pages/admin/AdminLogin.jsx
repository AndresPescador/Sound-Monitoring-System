import { operationError } from '../../i18n/serverMessages'
import { message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import ThemeToggle from '../../components/shared/ThemeToggle'
import LanguageSwitcher from '../../components/shared/LanguageSwitcher'

export default function AdminLogin() {
  const { t } = useLanguage()
  const { login } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/admin/stations', { replace: true })
    } catch (err) {
      setError(operationError(err, 'admin.could_not_sign_in_check_your_username_and_password'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login">
      <section className="admin-login__brand-panel" aria-labelledby="admin-access-title">
        <div className="admin-login__rings" aria-hidden="true"><span /><span /><span /></div>
        <div className="admin-login__brand-copy">
          <Link to="/" className="admin-login__brand" aria-label={t('admin.back_to_the_system_introduction')}>
            <img src="/assets/logo-oido-urbano.png" alt="" aria-hidden="true" />
            <span>{t('admin.acoustic_monitoring')}<small>Bogotá D.C.</small>
            </span>
          </Link>
          <h1 id="admin-access-title">{t('admin.acoustic_network_operations')}</h1>
          <p>{t('admin.manage_stations_credentials_and_access_through_the_monitoring_portal')}</p>
        </div>
      </section>

      <main className="admin-login__form-panel" id="main-content" tabIndex={-1}>
        <div className="admin-login__toolbar"><LanguageSwitcher />
          <ThemeToggle /></div>

        <div className="admin-login__form-wrap">
          <h2>{t('admin.sign_in')}</h2>
          <p>{t('admin.sign_in_with_an_authorized_account_to_access_the')}</p>

          {location.state?.passwordChanged && (
            <div className="admin-alert admin-alert--success" role="status">{t('admin.password_updated_all_previous_sessions_have_been_closed')}</div>
          )}

          <form onSubmit={handleSubmit} className="admin-login__form">
            <div className="admin-field">
              <label htmlFor="admin-username">{t('admin.username')}</label>
              <input
                id="admin-username"
                className="admin-input"
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>

            <div className="admin-field">
              <label htmlFor="admin-password">{t('admin.password')}</label>
              <input
                id="admin-password"
                className="admin-input"
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            {error && <div className="admin-alert" role="alert">{t(error)}</div>}

            <button
              type="submit"
              disabled={loading}
              className="admin-button admin-button--primary admin-login__submit"
            >
              {loading ? t('admin.checking_access') : t('admin.sign_in')}
            </button>
          </form>
        </div>

        <footer className="admin-login__footer">
          <span>{t('admin.access_restricted_to_authorized_staff')}</span>
          <Link to="/mapa-2d">{t('admin.back_to_the_public_map')}</Link>
        </footer>
      </main>
    </div>
  )
}
