import { useLanguage } from '../../context/LanguageContext'
import { useId, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
export default function ChartInfo({ text }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const id = useId()
  const button = useRef(null)
  const panel = useRef(null)
  const [position, setPosition] = useState({ top: 8, left: 8 })
  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = button.current.getBoundingClientRect()
      const width = Math.min(320, window.innerWidth - 24)
      const height = panel.current?.offsetHeight ?? 180
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12)) })
    }
    const dismiss = event => {
      if (event.type === 'keydown' && event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus() }
      if (event.type === 'pointerdown' && !panel.current?.contains(event.target) && !button.current?.contains(event.target)) setOpen(false)
    }
    place()
    document.addEventListener('keydown', dismiss, true)
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { document.removeEventListener('keydown', dismiss, true); document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  return <span className="dashboard-info">
    <button ref={button} type="button" className="dashboard-info__button" aria-label={t('common.about_this_metric')} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(v => !v)}>?</button>
    {open && createPortal(<div ref={panel} id={id} role="note" className="ux-help" style={position}>{text}</div>, document.body)}
  </span>
}
