import { serverMessage } from '../../i18n/serverMessages'
import { useLanguage } from '../../context/LanguageContext'
import { useEffect, useRef, useState } from 'react'
import { Modal } from './ModalComponents'

export function SecretDisplayModal({ data, onClose }) {
  const { t } = useLanguage()
  const [copyState, setCopyState] = useState('idle')
  const resetTimer = useRef(null)
  const secret = data.newSecret || data.secret || ''

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopyState('copied')
      resetTimer.current = setTimeout(() => setCopyState('idle'), 3000)
    } catch {
      setCopyState('error')
    }
  }

  return (
    <Modal title={t('admin.secret_generated')} onClose={null}>
      <div className="admin-secret">
        <div className="admin-alert admin-alert--warning" role="alert">
          <span>
            <strong>{t('admin.this_value_will_not_be_shown_again')}</strong><br />{t('admin.copy_it_and_configure_it_on_the_raspberry_pi')}</span>
        </div>

        <div>
          <p className="admin-secret__label">{t('admin.station_2')}</p>
          <p className="admin-secret__station">{data.stationCode}</p>
        </div>

        <div>
          <p className="admin-secret__label">Secret</p>
          <div className="admin-secret__value">
            <code>{secret}</code>
            <button type="button" onClick={handleCopy} className="admin-button admin-button--secondary">
              {copyState === 'copied' ? t('admin.copied') : t('admin.copy')}
            </button>
          </div>
        </div>

        {copyState === 'error' && (
          <div className="admin-alert" role="alert">{t('admin.could_not_copy_automatically_select_the_value_and_copy')}</div>
        )}

        {data.message && <p className="admin-secret__message">{t(serverMessage(data.message, data.lifecycleStatus === 'PROVISIONING' ? 'admin.provisioning_pending' : 'admin.secret_rotation_notice'))}</p>}

        <div className="admin-form__actions">
          <button type="button" onClick={onClose} className="admin-button admin-button--primary">{t('admin.i_have_saved_it_close')}</button>
        </div>
      </div>
    </Modal>
  )
}
