import { useState } from 'react'
import { updateStation } from '../../api/admin'
import { Modal, Field } from './ModalComponents'

export function EditStationModal({ station, onClose, onSaved }) {
  const [form, setForm]   = useState({
    name:        station.name        || '',
    locality:    station.locality    || '',
    description: station.description || '',
    address:     station.address     || '',
    latitude:    station.latitude    || '',
    longitude:   station.longitude   || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await updateStation(station.stationCode, {
        ...form,
        latitude:  parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Editar ${station.stationCode}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre" name="name" value={form.name}
                 onChange={handleChange} required />
          <Field label="Localidad" name="locality" value={form.locality}
                 onChange={handleChange} required />
          <Field label="Dirección" name="address" value={form.address}
                 onChange={handleChange} />
          <div /> {/* spacer */}
          <Field label="Latitud" name="latitude" value={form.latitude}
                 onChange={handleChange} required />
          <Field label="Longitud" name="longitude" value={form.longitude}
                 onChange={handleChange} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Descripción</label>
          <textarea
            name="description" value={form.description} onChange={handleChange}
            rows={2}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm
                       text-text bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && <p className="text-sm text-noise-high">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm border border-border rounded-lg
                             text-text-muted hover:text-text transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm bg-primary text-white rounded-lg
                             hover:bg-primary-dark transition-colors disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}