import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react'
import { createTranslator, defaultT, LANGUAGE_STORAGE_KEY } from '../i18n/core.mjs'

function readLanguage() {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

const LanguageContext = createContext({ language: 'es', t: defaultT, setLanguage: () => {} })

export function LanguageProvider({ children }) {
  const [language, updateLanguage] = useState(readLanguage)
  const value = useMemo(() => {
    const t = createTranslator(language)
    return {
      language, t, locale: t.locale, dateLocale: t.dateLocale,
      formatNumber: t.number, formatDateTime: t.dateTime,
      setLanguage(next) {
        if (next !== 'es' && next !== 'en') return
        try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next) } catch { /* Session preference still works. */ }
        updateLanguage(next)
      },
    }
  }, [language])

  useLayoutEffect(() => { document.documentElement.lang = language }, [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export const useLanguage = () => useContext(LanguageContext)
