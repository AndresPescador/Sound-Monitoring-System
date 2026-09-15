import { useRef, useEffect } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'
export default function PublicPreferences() {
  const { t } = useLanguage()
  const ref = useRef(null)
  useEffect(() => {
    const close = event => { if (!ref.current?.contains(event.target)) ref.current?.removeAttribute('open') }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return <details ref={ref} className="ux-preferences" onKeyDown={e => { if (e.key === 'Escape') { ref.current.open = false; ref.current.querySelector('summary').focus() } }}>
    <summary aria-label={t('ux.settings')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></summary><div><LanguageSwitcher /><ThemeToggle /></div>
  </details>
}
