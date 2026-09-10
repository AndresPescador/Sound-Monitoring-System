import { operationError } from '../../i18n/serverMessages'
import { message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
import { useId, useMemo, useState } from 'react'
import { registerStationAuth } from '../../api/admin'
import { BOGOTA_LOCALITIES, localitySlug, stationCodePreview } from '../../constants/bogotaLocalities'
import { Field, Modal } from './ModalComponents'
import StationLocationPicker from './StationLocationPicker'

const EMPTY = { locality: '', name: '', description: '', address: '', latitude: '', longitude: '' }

const defaultName = locality => locality.trim() ? `Estación ${locality.trim()}` : ''

const matchingBogotaLocality = locality => {
  const slug = localitySlug(locality || '')
  return slug ? BOGOTA_LOCALITIES.find(item => localitySlug(item.value) === slug) : undefined
}

const suggestedBogotaLocality = locality => {
  const slug = localitySlug(locality || '')
  if (!slug) return undefined
  return BOGOTA_LOCALITIES.find(item => localitySlug(item.value).startsWith(slug))
}

function LocalityAutocomplete({ value, onChange, onBlur, onKeyDown, suggestion, disabled, error }) {
  const { t } = useLanguage()
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()
  const recognizedLocality = matchingBogotaLocality(value)
  const hasSuggestion = suggestion && suggestion.value !== value
  const hint = hasSuggestion
    ? t('admin.suggestion_press_tab_to_complete_it', { p0: suggestion.value })
    : value.trim()
      ? recognizedLocality
        ? t('admin.is_a_bogota_locality', { p0: recognizedLocality.value })
        : t('admin.it_will_be_registered_as_another_locality_and_its')
      : t('admin.enter_a_locality_tab_completes_a_bogota_suggestion')

  return (
    <div className="admin-field">
      <label htmlFor={inputId}>{t('admin.locality')}</label>
      <div className="admin-locality-autocomplete">
        {hasSuggestion && <span className="admin-locality-autocomplete__ghost" aria-hidden="true">{suggestion.value}</span>}
        <input
          id={inputId}
          className="admin-input"
          type="text"
          name="locality"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={t('admin.enter_a_locality_for_example_fontibon_or_sopo')}
          required
          maxLength={100}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete={hasSuggestion ? 'both' : 'none'}
          aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <p id={hintId} className="admin-field__hint" aria-live="polite">{hint}</p>
      {error && <p id={errorId} className="admin-field__error">{t(error)}</p>}
    </div>
  )
}

const coordinatesAreValid = (latitude, longitude) => {
  if (String(latitude).trim() === '' || String(longitude).trim() === '') return false
  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)
  return Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude)
    && parsedLatitude >= -90 && parsedLatitude <= 90
    && parsedLongitude >= -180 && parsedLongitude <= 180
}

export function CreateStationModal({ onClose, onCreated }) {
  const { t } = useLanguage()
  const [form, setForm] = useState(EMPTY)
  const [currentStep, setCurrentStep] = useState(1)
  const [submissionStep, setSubmissionStep] = useState('')
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})

  const locality = form.locality
  const localitySuggestion = suggestedBogotaLocality(locality)
  const codePreview = stationCodePreview(locality)
  const identityErrors = useMemo(() => ({
    locality: !locality.trim()
      ? localizedMessage('admin.select_or_enter_a_locality_to_continue')
      : !stationCodePreview(locality)
        ? localizedMessage('admin.the_locality_must_generate_a_code_of_up_to')
        : '',
    name: form.name.trim() ? '' : localizedMessage('admin.enter_the_station_s_public_name'),
  }), [locality, form.name])
  const locationErrors = useMemo(() => ({
    coordinates: coordinatesAreValid(form.latitude, form.longitude)
      ? '' : localizedMessage('admin.select_a_point_on_the_map_or_enter_valid'),
  }), [form.latitude, form.longitude])
  const identityValid = !identityErrors.locality && !identityErrors.name
  const locationValid = !locationErrors.coordinates
  const isSubmitting = Boolean(submissionStep)

  const updateForm = values => setForm(previous => ({ ...previous, ...values }))
  const handleFieldChange = event => updateForm({ [event.target.name]: event.target.value })
  const handleBlur = field => setTouched(previous => ({ ...previous, [field]: true }))

  const updateLocality = nextLocality => {
    setForm(previous => {
      return {
        ...previous,
        locality: nextLocality,
        name: !previous.name || previous.name === defaultName(previous.locality)
          ? defaultName(nextLocality) : previous.name,
      }
    })
  }

  const handleLocalityChange = event => {
    const typedLocality = event.target.value
    updateLocality(matchingBogotaLocality(typedLocality)?.value || typedLocality)
  }

  const handleLocalityKeyDown = event => {
    if (event.key !== 'Tab' || !localitySuggestion || localitySuggestion.value === locality) return
    event.preventDefault()
    updateLocality(localitySuggestion.value)
  }

  const handleMapPick = (latitude, longitude) => {
    updateForm({ latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) })
    setTouched(previous => ({ ...previous, coordinates: true }))
  }

  const continueToLocation = () => {
    setTouched({ locality: true, name: true })
    if (identityValid) setCurrentStep(2)
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setTouched({ locality: true, name: true, coordinates: true })
    if (!identityValid || !locationValid) return

    setError('')
    try {
      setSubmissionStep(localizedMessage('admin.creating_credentials_and_provisioning'))
      const response = await registerStationAuth({
        name: form.name.trim(),
        locality: locality.trim(),
        description: form.description,
        address: form.address,
        latitude: Number.parseFloat(form.latitude),
        longitude: Number.parseFloat(form.longitude),
      })
      onCreated(response.data)
    } catch (requestError) {
      setError(operationError(requestError, 'admin.could_not_create_the_station_check_the_details_and'))
      setSubmissionStep('')
    }
  }

  return (
    <Modal title={t('admin.new_station')} onClose={isSubmitting ? null : onClose}>
      <form onSubmit={handleSubmit} className="admin-station-wizard" noValidate>
        <header className="admin-station-wizard__intro">
          <p className="admin-station-wizard__eyebrow">{t('admin.guided_setup')}</p>
          <h3>{t('admin.create_a_station_in_two_steps')}</h3>
          <p>{t('admin.first_define_its_identity_then_mark_where_it_is')}</p>
        </header>

        <ol className="admin-station-steps" aria-label={t('admin.registration_progress')}>
          <li className={currentStep === 1 ? 'is-current' : 'is-complete'} aria-current={currentStep === 1 ? 'step' : undefined}>
            <span>1</span><div><strong>{t('admin.identity')}</strong><small>{t('admin.name_and_locality')}</small></div>
          </li>
          <li className={currentStep === 2 ? 'is-current' : ''} aria-current={currentStep === 2 ? 'step' : undefined}>
            <span>2</span><div><strong>{t('admin.location')}</strong><small>{t('admin.map_and_coordinates')}</small></div>
          </li>
        </ol>

        {currentStep === 1 && (
          <section className="admin-station-wizard__step" aria-labelledby="station-identity-title">
            <div className="admin-station-wizard__step-heading">
              <h3 id="station-identity-title">{t('admin.how_will_you_identify_this_station')}</h3>
              <p>{t('admin.these_details_will_appear_on_the_map_and_dashboard')}</p>
            </div>
            <div className="admin-form-grid">
              <LocalityAutocomplete
                value={form.locality}
                onChange={handleLocalityChange}
                onBlur={() => handleBlur('locality')}
                onKeyDown={handleLocalityKeyDown}
                suggestion={localitySuggestion}
                disabled={isSubmitting}
                error={touched.locality ? identityErrors.locality : ''}
              />
              <div className="admin-station-code-card">
                <span className="admin-station-code-card__label">{t('admin.internal_code')}</span>
                <output>{codePreview || t('admin.generated_when_you_enter_the_locality')}</output>
                <p>{t('admin.assigned_automatically_it_cannot_be_edited_and_is_used')}</p>
              </div>
              <Field
                label={t('admin.station_name')}
                name="name"
                value={form.name}
                onChange={handleFieldChange}
                onBlur={() => handleBlur('name')}
                placeholder={t('admin.e_g_estacion_sopo')}
                required
                maxLength={150}
                disabled={isSubmitting}
                hint={t('common.station_name_hint')}
                error={touched.name ? identityErrors.name : ''}
              />
            </div>
          </section>
        )}

        {currentStep === 2 && (
          <section className="admin-station-wizard__step" aria-labelledby="station-location-title">
            <div className="admin-station-wizard__step-heading">
              <h3 id="station-location-title">{t('admin.where_is_it_installed')}</h3>
              <p>{t('admin.mark_the_point_on_the_map_or_enter_the')}</p>
            </div>
            <div className="admin-station-summary" role="status">
              <span>{t('admin.station_2')}</span><strong>{form.name.trim() || t('admin.unnamed')}</strong>
              <span>{t('admin.locality_2')}</span><strong>{locality.trim() || t('admin.no_locality')}</strong>
              <span>{t('admin.internal_code')}</span><strong>{codePreview || t('admin.pending')}</strong>
            </div>
            <StationLocationPicker latitude={form.latitude} longitude={form.longitude} onPick={handleMapPick} />
            <div className="admin-form-grid admin-station-coordinates">
              <Field
                label={t('admin.latitude')}
                name="latitude"
                value={form.latitude}
                onChange={handleFieldChange}
                onBlur={() => handleBlur('coordinates')}
                placeholder={t('admin.e_g_4_6572')}
                type="number"
                step="any"
                required
                disabled={isSubmitting}
                hint={t('admin.latitude_hint')}
                error={touched.coordinates ? locationErrors.coordinates : ''}
              />
              <Field
                label={t('admin.longitude')}
                name="longitude"
                value={form.longitude}
                onChange={handleFieldChange}
                onBlur={() => handleBlur('coordinates')}
                placeholder={t('admin.e_g_74_0632')}
                type="number"
                step="any"
                required
                disabled={isSubmitting}
                hint={t('admin.longitude_hint')}
                error={touched.coordinates ? locationErrors.coordinates : ''}
              />
            </div>
            <details className="admin-station-details">
              <summary>{t('admin.additional_details_optional')}</summary>
              <div className="admin-form-grid">
                <Field label={t('admin.address')} name="address" value={form.address} onChange={handleFieldChange} placeholder="Calle 72 #10-07" disabled={isSubmitting} />
                <div aria-hidden="true" />
                <div className="admin-field admin-field--wide">
                  <label htmlFor="station-description">{t('admin.description')}</label>
                  <textarea id="station-description" className="admin-textarea" name="description" value={form.description} onChange={handleFieldChange} rows={3} placeholder={t('admin.useful_information_about_the_site_or_installation')} disabled={isSubmitting} />
                </div>
              </div>
            </details>
          </section>
        )}

        {error && <div className="admin-alert" role="alert">{t(error)}</div>}
        {submissionStep && <div className="admin-alert admin-alert--warning" role="status">{t(submissionStep)}</div>}

        <footer className="admin-station-wizard__actions">
          {currentStep === 2 && (
            <button type="button" onClick={() => setCurrentStep(1)} disabled={isSubmitting} className="admin-button admin-button--secondary">{t('admin.back')}</button>
          )}
          <button type="button" onClick={onClose} disabled={isSubmitting} className="admin-button admin-button--quiet">
            {currentStep === 1 ? t('admin.cancel') : t('admin.close')}
          </button>
          {currentStep === 1 ? (
            <button type="button" onClick={continueToLocation} disabled={!identityValid || isSubmitting} className="admin-button admin-button--primary">{t('admin.continue_to_location')}</button>
          ) : (
            <button type="submit" disabled={!locationValid || isSubmitting} className="admin-button admin-button--primary">
              {t(submissionStep) || t('admin.create_station')}
            </button>
          )}
        </footer>
      </form>
    </Modal>
  )
}
