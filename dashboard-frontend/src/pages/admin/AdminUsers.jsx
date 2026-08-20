import { useEffect, useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout'
import { createAdmin, listAdmins } from '../../api/admin'

const formatDate = (value, withTime = false) => {
  if (!value) return null
  const options = withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }
  return new Intl.DateTimeFormat('es-CO', options).format(new Date(value))
}

function AdminListSkeleton() {
  return (
    <div className="admin-skeleton-list" role="status" aria-label="Cargando administradores">
      {[0, 1, 2].map(item => (
        <div className="admin-skeleton-row" key={item} aria-hidden="true"><span /><span /></div>
      ))}
    </div>
  )
}

export default function AdminUsers() {
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
      .catch(() => setError('No se pudieron cargar los administradores. Revisa la conexión e inténtalo de nuevo.'))
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    setFormError('')

    if (form.password !== form.confirmPassword) {
      setFormError('Las contraseñas no coinciden.')
      return
    }
    if (form.password.length < 12) {
      setFormError('La contraseña debe tener al menos 12 caracteres.')
      return
    }

    setCreating(true)
    try {
      const response = await createAdmin(form.username, form.password)
      setAdmins(previous => [...previous, response.data])
      setForm({ username: '', password: '', confirmPassword: '' })
      setShowForm(false)
    } catch (err) {
      setFormError(err.response?.data?.error || 'No se pudo crear el administrador.')
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
            <h1 tabIndex={-1}>Administradores</h1>
            <p>Gestiona las cuentas que pueden operar la red y sus servicios internos.</p>
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
              {showForm ? 'Cancelar' : 'Nuevo administrador'}
            </button>
          </div>
        </header>

        {showForm && (
          <section className="admin-form-panel" id="new-admin-form" aria-labelledby="new-admin-title">
            <div className="admin-form-panel__heading">
              <h2 id="new-admin-title">Crear administrador</h2>
              <p>La nueva cuenta tendrá acceso operativo. Usa una contraseña única de mínimo 12 caracteres.</p>
            </div>
            <form onSubmit={handleCreate} className="admin-form">
              <div className="admin-form-grid">
                <div className="admin-field admin-field--wide">
                  <label htmlFor="new-admin-username">Usuario</label>
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
                  <label htmlFor="new-admin-password">Contraseña</label>
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
                  <label htmlFor="new-admin-confirm-password">Confirmar contraseña</label>
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

              {formError && <div className="admin-alert" role="alert">{formError}</div>}

              <div className="admin-form__actions">
                <button type="submit" disabled={creating} className="admin-button admin-button--primary">
                  {creating ? 'Creando cuenta…' : 'Crear administrador'}
                </button>
              </div>
            </form>
          </section>
        )}

        {error && <div className="admin-alert" role="alert">{error}</div>}

        <section className="admin-panel" aria-labelledby="admin-list-title">
          <div className="admin-panel__header">
            <div>
              <h2 id="admin-list-title">Accesos registrados</h2>
              <p>{loading ? 'Consultando el directorio…' : `${activeAdmins} cuentas activas`}</p>
            </div>
            <span className="admin-panel__count">{loading ? '…' : `${admins.length} cuentas`}</span>
          </div>

          {loading ? (
            <AdminListSkeleton />
          ) : admins.length === 0 ? (
            <div className="admin-empty">
              <h2>No hay cuentas adicionales</h2>
              <p>Crea una cuenta cuando otra persona necesite operar el sistema.</p>
            </div>
          ) : (
            <div className="admin-user-list">
              {admins.map(admin => (
                <article className="admin-user-row" key={admin.id}>
                  <div>
                    <div className="admin-user-row__topline">
                      <h3 className="admin-user-row__name">{admin.username}</h3>
                      {admin.superAdmin && <span className="admin-status admin-status--role">Superadministrador</span>}
                      <span className={`admin-status admin-status--${admin.active ? 'active' : 'inactive'}`}>
                        {admin.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <p className="admin-user-row__meta">
                      <span>Creado: {formatDate(admin.createdAt) || 'Sin registro'}</span>
                      <span>Último acceso: {formatDate(admin.lastLoginAt, true) || 'Aún no ingresa'}</span>
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
