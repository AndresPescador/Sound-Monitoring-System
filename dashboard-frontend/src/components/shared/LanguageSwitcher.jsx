import '../../i18n/language.css'
import { useLanguage } from '../../context/LanguageContext'

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()
  return (
    <div className="language-switcher" role="group" aria-label={language === 'en' ? 'Language' : 'Idioma'}>
      <button type="button" lang="es" aria-label="Español" aria-pressed={language === 'es'} onClick={() => setLanguage('es')}>ES</button>
      <button type="button" lang="en" aria-label="English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
    </div>
  )
}
