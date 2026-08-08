import { useState } from 'react'
import { registerStationAuth, registerStationProcessing } from '../../api/admin'
import { Modal, Field } from './ModalComponents'

const EMPTY = {
  stationCode: '', name: '', locality: '', description: '',
  address: '', latitude: '', longitude: '',
}

export function CreateStationModal({ onClose, onCreated }) {
  const [form, setForm]   = useState(EMPTY)
  const [error, setError] = useState('')
  const [step, setStep]   = useState('')   // mensaje de progreso

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const payload = {
      ...form,
      latitude:  parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
    }

    try {
      // Paso 1 — Auth Service (genera el secret)
      setStep('Registrando credenciales...')
      const authRes = await registerStationAuth({
        stationCode:  payload.stationCode,
        name:         payload.name,
        locality:     payload.locality,
        description:  payload.description,
      })
      const secret = authRes.data.secret

      // Paso 2 — Noise Processing (datos geográficos)
      setStep('Registrando datos geográficos...')
      await registerStationProcessing(payload)

      onCreated(secret, payload.stationCode)
    } catch (err) {
      const msg = err.response?.data?.error
      setError(msg || 'Error al crear la estación.')
      setStep('')
    }
  }

  return (
    <Modal title="Nueva estación" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Código" name="stationCode" value={form.stationCode}
                 onChange={handleChange} placeholder="ST-CHAPINERO-02" required />
          <Field label="Nombre" name="name" value={form.name}
                 onChange={handleChange} placeholder="Estación Chapinero Norte" required />
          <Field label="Localidad" name="locality" value={form.locality}
                 onChange={handleChange} placeholder="Chapinero" required />
          <Field label="Dirección" name="address" value={form.address}
                 onChange={handleChange} placeholder="Calle 72 #10-07" />
          <Field label="Latitud" name="latitude" value={form.latitude}
                 onChange={handleChange} placeholder="4.6572" required />
          <Field label="Longitud" name="longitude" value={form.longitude}
                 onChange={handleChange} placeholder="-74.0632" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Descripción</label>
          <textarea
            name="description" value={form.description} onChange={handleChange}
            rows={2} placeholder="Descripción opcional de la estación"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm
                       text-text bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && <p className="text-sm text-noise-high">{error}</p>}
        {step  && <p className="text-sm text-text-muted">{step}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm border border-border rounded-lg
                             text-text-muted hover:text-text transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={!!step}
                  className="px-4 py-2 text-sm bg-primary text-white rounded-lg
                             hover:bg-primary-dark transition-colors disabled:opacity-50">
            {step || 'Crear estación'}
          </button>
        </div>
      </form>
    </Modal>
  )
}