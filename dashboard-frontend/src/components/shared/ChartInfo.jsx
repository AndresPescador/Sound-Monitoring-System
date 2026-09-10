import { useLanguage } from '../../context/LanguageContext'
import { useState } from 'react'

/**
 * Ícono de información con tooltip al hacer hover.
 * Muestra una explicación no técnica de la métrica cuando se pasa el mouse.
 * 
 * @param {string} text - Texto descriptivo a mostrar en el tooltip
 */
export default function ChartInfo({ text }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <span className="dashboard-info relative inline-flex items-center ml-1.5">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="dashboard-info__button"
        aria-label={t('common.about_this_metric')}
      >
        ?
      </button>
      {open && (
        <span
          className="dashboard-info__tooltip"
        >
          {text}
        </span>
      )}
    </span>
  )
}
