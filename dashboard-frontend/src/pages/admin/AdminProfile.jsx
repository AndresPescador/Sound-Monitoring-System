import { operationError } from '../../i18n/serverMessages'
import { message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { changeAdminPassword } from '../../api/admin'

export default function AdminProfile() {
  const { t } = useLanguage()
  const { user, logout } = useAdminAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (form.newPassword !== form.confirmPassword) {
      setError(localizedMessage('admin.the_new_password_and_its_confirmation_do_not_match'))
      return
    }
    if (form.newPassword.length < 12) {
      setError(localizedMessage('admin.the_new_password_must_contain_at_least_12_characters'))
      return
    }

    setSaving(true)
    try {
      await changeAdminPassword(form.currentPassword, form.newPassword)
      logout()
      navigate('/admin/login', {
        replace: true,
        state: { passwordChanged: true },
      })
    } catch (err) {
      setError(operationError(err, 'admin.could_not_update_the_password'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="admin-page">
        <header className="admin-page-header">
          <div>
            <h1 tabIndex={-1}>{t('admin.my_profile')}</h1>
            <p>{t('admin.check_your_access_level_and_protect_your_account_credentials')}</p>
          </div>
        </header>

        <div className="admin-profile-grid">
          <section className="admin-account-card" aria-labelledby="account-title">
            <div className="admin-account-card__header">
              <p id="account-title">{t('admin.authenticated_account')}</p>
              <strong>{user?.username}</strong>
            </div>
            <dl>
              <div>
                <dt>{t('admin.role')}</dt>
                <dd>{user?.superAdmin ? t('admin.super_administrator') : t('admin.administrator')}</dd>
              </div>
              <div>
                <dt>{t('admin.session')}</dt>
                <dd>{t('admin.active_in_this_browser')}</dd>
              </div>
            </dl>
          </section>

          <section className="admin-form-panel" aria-labelledby="password-title">
            <div className="admin-form-panel__heading">
              <h2 id="password-title">{t('admin.change_password')}</h2>
              <p>{t('admin.use_at_least_12_characters_and_avoid_reusing_credentials')}</p>
            </div>

            <form onSubmit={handleSubmit} className="admin-form">
              <div className="admin-field">
                <label htmlFor="current-password">{t('admin.current_password')}</label>
                <input
                  id="current-password"
                  className="admin-input"
                  type="password"
                  name="currentPassword"
                  value={form.currentPassword}
                  onChange={handleChange}
                  autoComplete="current-password"
                  required
                  disabled={saving}
                />
              </div>

              <div className="admin-form-grid">
                <div className="admin-field">
                  <label htmlFor="new-password">{t('admin.new_password')}</label>
                  <input
                    id="new-password"
                    className="admin-input"
                    type="password"
                    name="newPassword"
                    value={form.newPassword}
                    onChange={handleChange}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    disabled={saving}
                  />
                </div>
                <div className="admin-field">
                  <label htmlFor="confirm-password">{t('admin.confirm_password')}</label>
                  <input
                    id="confirm-password"
                    className="admin-input"
                    type="password"
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    disabled={saving}
                  />
                </div>
              </div>

              {error && <div className="admin-alert" role="alert">{t(error)}</div>}
              <div className="admin-form__actions">
                <button type="submit" disabled={saving} className="admin-button admin-button--primary">
                  {saving ? t('maps.updating') : t('admin.update_password')}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </AdminLayout>
  )
}
