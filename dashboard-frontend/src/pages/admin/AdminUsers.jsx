import { operationError } from '../../i18n/serverMessages'
import { defaultT, message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useEffect, useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout'
import { createAdmin, listAdmins } from '../../api/admin'

const formatDate = (value, withTime = false, t = defaultT) => {
  if (!value) return null
  const options = withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }
  return new Intl.DateTimeFormat(t.locale, options).format(new Date(value))
}

function AdminListSkeleton() {
  const { t } = useLanguage()
  return (
    <div className="admin-skeleton-list" role="status" aria-label={t('admin.loading_administrators')}>
      {[0, 1, 2].map(item => (
        <div className="admin-skeleton-row" key={item} aria-hidden="true"><span /><span /></div>
      ))}
    </div>
  )
}

export default function AdminUsers() {
  const { t } = useLanguage()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '' })
  const [formError, setFormError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    listAdmins()
      .then(response => setAdmins(response.data))
      .catch(() => setError(localizedMessage('admin.could_not_load_administrators_check_your_connection_and_try')))
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    setFormError('')

    if (form.password !== form.confirmPassword) {
      setFormError(localizedMessage('admin.the_passwords_do_not_match'))
      return
    }
    if (form.password.length < 12) {
      setFormError(localizedMessage('admin.the_password_must_contain_at_least_12_characters'))
      return
    }

    setCreating(true)
    try {
      const response = await createAdmin(form.username, form.password)
      setAdmins(previous => [...previous, response.data])
      setForm({ username: '', password: '', confirmPassword: '' })
      setShowForm(false)
    } catch (err) {
      setFormError(operationError(err, 'admin.could_not_create_the_administrator'))
    } finally {
      setCreating(false)
    }
  }

  const activeAdmins = admins.filter(admin => admin.active).length

  return (
    <AdminLayout>
      <div className="admin-page">
        <header className="admin-page-header">
          <div>
            <h1 tabIndex={-1}>{t('admin.administrators')}</h1>
            <p>{t('admin.manage_accounts_that_can_operate_the_network_and_its')}</p>
          </div>
          <div className="admin-page-header__actions">
            <button
              type="button"
              onClick={() => {
                setShowForm(previous => !previous)
                setFormError('')
              }}
              className={`admin-button ${showForm ? 'admin-button--secondary' : 'admin-button--primary'}`}
              aria-expanded={showForm}
              aria-controls="new-admin-form"
            >
              {showForm ? t('admin.cancel') : t('admin.new_administrator')}
            </button>
          </div>
        </header>

        {showForm && (
          <section className="admin-form-panel" id="new-admin-form" aria-labelledby="new-admin-title">
            <div className="admin-form-panel__heading">
              <h2 id="new-admin-title">{t('admin.create_administrator')}</h2>
              <p>{t('admin.the_new_account_will_have_operational_access_use_a')}</p>
            </div>
            <form onSubmit={handleCreate} className="admin-form">
              <div className="admin-form-grid">
                <div className="admin-field admin-field--wide">
                  <label htmlFor="new-admin-username">{t('admin.username')}</label>
                  <input
                    id="new-admin-username"
                    className="admin-input"
                    type="text"
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    autoComplete="off"
                    required
                    disabled={creating}
                  />
                </div>
                <div className="admin-field">
                  <label htmlFor="new-admin-password">{t('admin.password')}</label>
                  <input
                    id="new-admin-password"
                    className="admin-input"
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    disabled={creating}
                  />
                </div>
                <div className="admin-field">
                  <label htmlFor="new-admin-confirm-password">{t('admin.confirm_password')}</label>
                  <input
                    id="new-admin-confirm-password"
                    className="admin-input"
                    type="password"
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    disabled={creating}
                  />
                </div>
              </div>

              {formError && <div className="admin-alert" role="alert">{t(formError)}</div>}

              <div className="admin-form__actions">
                <button type="submit" disabled={creating} className="admin-button admin-button--primary">
                  {creating ? t('admin.creating_account') : t('admin.create_administrator')}
                </button>
              </div>
            </form>
          </section>
        )}

        {error && <div className="admin-alert" role="alert">{t(error)}</div>}

        <section className="admin-panel" aria-labelledby="admin-list-title">
          <div className="admin-panel__header">
            <div>
              <h2 id="admin-list-title">{t('admin.registered_accounts')}</h2>
              <p>{loading ? t('admin.loading_directory') : t('common.active_account_count', { count: activeAdmins, value: t.number(activeAdmins) })}</p>
            </div>
            <span className="admin-panel__count">{loading ? '…' : t('common.account_count', { count: admins.length, value: t.number(admins.length) })}</span>
          </div>

          {loading ? (
            <AdminListSkeleton />
          ) : admins.length === 0 ? (
            <div className="admin-empty">
              <h2>{t('admin.no_additional_accounts')}</h2>
              <p>{t('admin.create_an_account_when_someone_else_needs_to_operate')}</p>
            </div>
          ) : (
            <div className="admin-user-list">
              {admins.map(admin => (
                <article className="admin-user-row" key={admin.id}>
                  <div>
                    <div className="admin-user-row__topline">
                      <h3 className="admin-user-row__name">{admin.username}</h3>
                      {admin.superAdmin && <span className="admin-status admin-status--role">{t('admin.super_administrator')}</span>}
                      <span className={`admin-status admin-status--${admin.active ? 'active' : 'inactive'}`}>
                        {admin.active ? t('admin.active') : t('admin.inactive')}
                      </span>
                    </div>
                    <p className="admin-user-row__meta">
                      <span>{t('admin.created') + ' '}{formatDate(admin.createdAt, undefined, t) || t('common.no_record')}</span>
                      <span>{t('admin.last_sign_in') + ' '}{formatDate(admin.lastLoginAt, true, t) || t('admin.has_not_signed_in_yet')}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}
