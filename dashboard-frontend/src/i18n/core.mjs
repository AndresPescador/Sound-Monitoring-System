import { es, enUS } from 'date-fns/locale'
import common from './common.mjs'
import admin from './admin.mjs'
import maps from './maps.mjs'
import charts from './charts.mjs'
import landing from './landing.mjs'
import seo from './seo.mjs'

export const LANGUAGE_STORAGE_KEY = 'sound-monitoring-language'
export const DEFAULT_LANGUAGE = 'es'
export const catalogs = { common, admin, maps, charts, landing, seo }
export const message = (key, params = {}) => ({ i18nKey: key, params })

export function createTranslator(language = DEFAULT_LANGUAGE) {
  const resolved = language === 'en' ? 'en' : 'es'
  const locale = resolved === 'en' ? 'en-US' : 'es-CO'
  const pluralRules = new Intl.PluralRules(locale)
  function t(key, params = {}) {
    if (key && typeof key === 'object' && key.i18nKey) return t(key.i18nKey, key.params)
    if (typeof key !== 'string') return key
    const separator = key.indexOf('.')
    const area = catalogs[key.slice(0, separator)]
    const name = key.slice(separator + 1)
    let text = area?.[resolved]?.[name] ?? area?.es?.[name]
    if (text === undefined) return key
    if (typeof text === 'object') text = text[pluralRules.select(Number(params.count))] ?? text.other
    return text.replace(/\{\{(\w+)\}\}/g, (_, field) => String(params[field] ?? ''))
  }
  t.language = resolved
  t.locale = locale
  t.dateLocale = resolved === 'en' ? enUS : es
  t.number = (value, options) => value == null ? undefined : new Intl.NumberFormat(locale, options).format(value)
  t.fixed = (value, digits = 1) => t.number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })
  t.dateTime = (value, options) => new Intl.DateTimeFormat(locale, options).format(new Date(value))
  return t
}

export const defaultT = createTranslator()
