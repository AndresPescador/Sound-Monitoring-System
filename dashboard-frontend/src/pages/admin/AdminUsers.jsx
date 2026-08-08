import { useState, useEffect } from 'react'
import AdminLayout from '../../components/admin/AdminLayout'
import { listAdmins, createAdmin } from '../../api/admin'

export default function AdminUsers() {
  const [admins, setAdmins]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState({ username: '', password: '', confirmPassword: '' })
  const [formError, setFormError]   = useState('')
  const [creating, setCreating]     = useState(false)

  useEffect(() => {
    listAdmins()
      .then(res => setAdmins(res.data))
      .catch(() => setError('No se pudieron cargar los administradores.'))
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleCreate = async (e) => {
    e.preventDefault()
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
      const res = await createAdmin(form.username, form.password)
      setAdmins(prev => [...prev, res.data])
      setForm({ username: '', password: '', confirmPassword: '' })
      setShowForm(false)
    } catch (err) {
      setFormError(err.response?.data?.error || 'Error al crear el administrador.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-display font-semibold text-text">Administradores</h1>
        <button
          onClick={() => setShowForm(prev => !prev)}
          className="px-4 py-2 bg-primary text-white text-sm font-medium
                     rounded-lg hover:bg-primary-dark transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Nuevo admin'}
        </button>
      </div>

      {/* Formulario inline de creación */}
      {showForm && (
        <div className="mb-6 bg-bg border border-border rounded-xl p-5 max-w-md">
          <p className="text-sm font-medium text-text mb-4">Crear administrador</p>
          <form onSubmit={handleCreate} className="space-y-3">
            {[
              { name: 'username',        label: 'Usuario',               type: 'text',     autocomplete: 'off' },
              { name: 'password',        label: 'Contraseña',            type: 'password', autocomplete: 'new-password' },
              { name: 'confirmPassword', label: 'Confirmar contraseña',  type: 'password', autocomplete: 'new-password' },
            ].map(({ name, label, type, autocomplete }) => (
              <div key={name}>
                <label className="block text-xs font-medium text-text-muted mb-1">{label}</label>
                <input
                  type={type} name={name} value={form[name]}
                  onChange={handleChange} autoComplete={autocomplete}
                  required disabled={creating}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm
                             text-text bg-surface focus:outline-none focus:ring-2
                             focus:ring-primary disabled:opacity-50"
                />
              </div>
            ))}
            {formError && <p className="text-sm text-noise-high">{formError}</p>}
            <button
              type="submit" disabled={creating}
              className="w-full py-2 text-sm bg-primary text-white rounded-lg
                         hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {creating ? 'Creando...' : 'Crear administrador'}
            </button>
          </form>
        </div>
      )}

      {error && <p className="text-sm text-noise-high mb-4">{error}</p>}

      {loading ? (
        <p className="text-text-muted text-sm">Cargando...</p>
      ) : (
        <div className="space-y-2">
          {admins.map(admin => (
            <div
              key={admin.id}
              className="bg-bg border border-border rounded-xl px-5 py-4
                         flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{admin.username}</span>
                  {admin.superAdmin && (
                    <span className="text-xs bg-primary/10 text-primary
                                     rounded px-1.5 py-0.5 font-medium">
                      Super Admin
                    </span>
                  )}
                  {!admin.active && (
                    <span className="text-xs bg-gray-100 text-gray-500
                                     rounded px-1.5 py-0.5">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-light mt-0.5">
                  Creado: {new Date(admin.createdAt).toLocaleDateString('es-CO')}
                  {admin.lastLoginAt && ` · Último login: ${new Date(admin.lastLoginAt).toLocaleString('es-CO')}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
