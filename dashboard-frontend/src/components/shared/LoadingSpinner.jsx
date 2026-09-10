import { message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
export default function LoadingSpinner({ label = localizedMessage('common.loading') }) {
  const { t } = useLanguage()
  return (
    <div className="dashboard-loading" role="status" aria-live="polite">
      <span className="dashboard-loading__mark" aria-hidden="true"><i /><i /><i /></span>
      <span className="dashboard-loading__label">{t(label)}</span>
    </div>
  )
}
