import { operationError } from '../../i18n/serverMessages'
import { message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useState } from 'react'
import { updateStationMetadata } from '../../api/admin'
import { Field, Modal } from './ModalComponents'
import StationLocationPicker from './StationLocationPicker'
import { BOGOTA_LOCALITIES, localitySlug } from '../../constants/bogotaLocalities'

const matchingBogotaLocality = locality => {
  const slug = localitySlug(locality || '')
  return slug ? BOGOTA_LOCALITIES.find(item => localitySlug(item.value) === slug) : undefined
}

export function EditStationModal({ station, onClose, onSaved }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({
    name: station.name || '',
    locality: station.locality || '',
    description: station.description || '',
    address: station.address || '',
    latitude: station.latitude ?? '',
    longitude: station.longitude ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleChange = (event) => {
    setForm(previous => ({ ...previous, [event.target.name]: event.target.value }))
  }

  const handleMapPick = (latitude, longitude) => {
    setForm(previous => ({
      ...previous,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        ...form,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
      }
      const response = await updateStationMetadata(station.stationCode, payload)
      onSaved(response.data)
    } catch (err) {
      setError(operationError(err, 'admin.could_not_synchronize_changes_across_both_services_try_again'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('admin.edit', { p0: station.stationCode })} onClose={saving ? null : onClose}>
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="admin-form-grid">
          <Field label={t('admin.station_name_2')} name="name" value={form.name} onChange={handleChange} required maxLength={150} disabled={saving} />
          <Field label={t('admin.station_code')} name="stationCode" value={station.stationCode} readOnly disabled />
          <div className="admin-field">
            <label htmlFor="edit-station-locality">{t('admin.locality_2')}</label>
            <input
              id="edit-station-locality"
              className="admin-input"
              name="locality"
              value={form.locality}
              onChange={event => setForm(previous => ({
                ...previous,
                locality: matchingBogotaLocality(event.target.value)?.value || event.target.value,
              }))}
              list="edit-station-localities"
              required
              maxLength={100}
              disabled={saving}
              placeholder={t('admin.e_g_fontibon')}
            />
            <datalist id="edit-station-localities">
              {BOGOTA_LOCALITIES.map(item => <option key={item.value} value={item.value} />)}
            </datalist>
            <p className="admin-field__hint">{t('admin.changing_it_does_not_change_the_station_s_technical')}</p>
          </div>
          <div aria-hidden="true" />
          <div className="admin-field--wide">
            <StationLocationPicker latitude={form.latitude} longitude={form.longitude} onPick={handleMapPick} />
          </div>
          <Field label={t('admin.address')} name="address" value={form.address} onChange={handleChange} disabled={saving} />
          <div aria-hidden="true" />
          <Field
            label={t('admin.latitude_2')}
            name="latitude"
            value={form.latitude}
            onChange={handleChange}
            type="number"
            step="any"
            required
            disabled={saving}
          />
          <Field
            label={t('admin.longitude_2')}
            name="longitude"
            value={form.longitude}
            onChange={handleChange}
            type="number"
            step="any"
            required
            disabled={saving}
          />
          <div className="admin-field admin-field--wide">
            <label htmlFor="edit-station-description">{t('admin.description')}</label>
            <textarea
              id="edit-station-description"
              className="admin-textarea"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              disabled={saving}
            />
          </div>
        </div>

        {error && <div className="admin-alert" role="alert">{t(error)}</div>}

        <div className="admin-form__actions">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="admin-button admin-button--secondary"
          >{t('admin.cancel')}</button>
          <button type="submit" disabled={saving} className="admin-button admin-button--primary">
            {saving ? t('admin.saving') : t('admin.save_changes')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
