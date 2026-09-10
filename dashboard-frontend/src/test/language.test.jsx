import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { LanguageProvider, useLanguage } from '../context/LanguageContext'
import { catalogs, createTranslator, LANGUAGE_STORAGE_KEY, message } from '../i18n/core.mjs'
import { operationError, serverMessage } from '../i18n/serverMessages'
import LanguageSwitcher from '../components/shared/LanguageSwitcher'
import DateRangePicker from '../components/shared/DateRangePicker'
import { NoMeasurementsNotice } from '../components/shared/RangeAvailabilityNotice'
import RouteNavigationManager from '../components/shared/RouteNavigationManager'
import { formatSeriesMeta } from '../components/shared/ResolutionNotice'
import { routeSeo } from '../seo.mjs'
import { stationPageTitle } from '../routes'

const es = createTranslator('es'), en = createTranslator('en')
function Probe() {
  const { t } = useLanguage()
  const [value, setValue] = useState('')
  return <><LanguageSwitcher /><h1>{t('admin.stations')}</h1><input aria-label="draft" value={value} onChange={e => setValue(e.target.value)} /><output>{t.fixed(1234.5, 2)}</output></>
}
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? (['test', 'i18n'].includes(entry.name) ? [] : sourceFiles(full)) : /\.(jsx|js|mjs)$/.test(full) && !full.includes('.test.') ? [full] : []
  })
}
beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'es' })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

describe('catalogs and formatting', () => {
  it('has matching keys, placeholders and plural branches', () => {
    for (const catalog of Object.values(catalogs)) {
      expect(Object.keys(catalog.en).sort()).toEqual(Object.keys(catalog.es).sort())
      for (const key of Object.keys(catalog.es)) {
        const spanish = catalog.es[key], english = catalog.en[key]
        expect(typeof english).toBe(typeof spanish)
        if (typeof spanish === 'object') expect(Object.keys(english).sort()).toEqual(Object.keys(spanish).sort())
        const parameters = value => [...new Set(JSON.stringify(value).match(/\{\{\w+\}\}/g) ?? [])].sort()
        expect(parameters(english), key).toEqual(parameters(spanish))
      }
    }
  })
  it('resolves every literal key in production components', () => {
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\b(?:t|defaultT|localizedMessage)\('([a-z]+\.[a-z0-9_]+)'/g)) {
        const [area, key] = match[1].split('.')
        expect(catalogs[area]?.es?.[key], `${file}: ${match[1]}`).toBeDefined()
      }
    }
  })
  it('interpolates, selects plurals and formats display values', () => {
    expect(en(message('admin.edit', { p0: 'Estación Sopo' }))).toBe('Edit Estación Sopo')
    expect(en('common.station_count', { count: 1, value: 1 })).toBe('1 station')
    expect(en('common.station_count', { count: 2, value: 2 })).toBe('2 stations')
    expect(es('common.station_count', { count: 0, value: 0 })).toBe('0 estaciones')
    expect(en.fixed(1234.5, 2)).toBe('1234.50')
    expect(es.fixed(1234.5, 2)).toBe('1234,50')
    expect(formatSeriesMeta({ count: 1 }, en)).toBe('Full range: 1 measurement.')
    expect(en('missing.key')).toBe('missing.key')
    expect(stationPageTitle('Estación Sopo', en)).toBe('Estación Sopo')
  })
  it('maps server errors and preserves partial-operation warnings', () => {
    const error = operationError({ response: { data: { error: 'Credenciales inválidas.' } } }, 'admin.could_not_sign_in_check_your_username_and_password')
    expect(es(error)).toBe('Credenciales inválidas.')
    expect(en(error)).toBe('Invalid credentials.')
    expect(en(serverMessage('Cambios guardados; la sincronización con Processing está pendiente.'))).toContain('synchronization with Processing is pending')
    expect(en(serverMessage('La estación quedó bloqueada; Processing rechazó la purga y requiere revisión.'))).toContain('station is blocked')
    const unknown = operationError({ response: { data: { error: 'Unexpected backend internals' } } }, 'admin.could_not_update_the_password')
    expect(en(unknown)).toBe('Could not update the password.')
  })
})

describe('language selection', () => {
  it('starts in Spanish, persists a choice and keeps the draft and focus', () => {
    render(<LanguageProvider><Probe /></LanguageProvider>)
    const input = screen.getByLabelText('draft')
    fireEvent.change(input, { target: { value: 'unsaved draft' } })
    expect(screen.getByRole('heading')).toHaveTextContent('Estaciones')
    const english = screen.getByRole('button', { name: 'English' })
    english.focus(); fireEvent.click(english)
    expect(english).toHaveFocus()
    expect(english).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('heading')).toHaveTextContent('Stations')
    expect(screen.getByLabelText('draft')).toBe(input)
    expect(input).toHaveValue('unsaved draft')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })
  it('restores saved English and rejects unsupported stored languages', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    const view = render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByRole('heading')).toHaveTextContent('Stations')
    view.unmount(); localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr')
    render(<LanguageProvider><Probe /></LanguageProvider>)
    expect(screen.getByRole('heading')).toHaveTextContent('Estaciones')
  })
  it('works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    render(<LanguageProvider><Probe /></LanguageProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('heading')).toHaveTextContent('Stations')
  })
  it('translates an existing validation error without applying or resetting a custom range', () => {
    const onChange = vi.fn()
    render(<LanguageProvider><LanguageSwitcher /><DateRangePicker onChange={onChange} /></LanguageProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }))
    const input = screen.getByLabelText('Fecha y hora inicial')
    fireEvent.change(input, { target: { value: '2026-09-09T12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Seleccione el inicio')
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Select the start and end')
    expect(screen.getByLabelText('Start date and time')).toBe(input)
    expect(input).toHaveValue('2026-09-09T12:00')
    expect(onChange).not.toHaveBeenCalled()
  })
  it('translates a default empty state', () => {
    render(<LanguageProvider><LanguageSwitcher /><NoMeasurementsNotice /></LanguageProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('status')).toHaveTextContent('No measurements available for this period.')
  })
  it('updates metadata without scrolling or changing the canonical URL', async () => {
    const scroll = vi.spyOn(window, 'scrollTo')
    render(<LanguageProvider><MemoryRouter initialEntries={['/mapa-2d']}><RouteNavigationManager /><Probe /></MemoryRouter></LanguageProvider>)
    const canonical = document.querySelector('link[rel="canonical"]').href
    scroll.mockClear(); fireEvent.click(screen.getByRole('button', { name: 'English' }))
    await waitFor(() => expect(document.title).toContain('Bogotá 2D acoustic map'))
    expect(document.querySelector('link[rel="canonical"]').href).toBe(canonical)
    expect(scroll).not.toHaveBeenCalled()
    expect(routeSeo('/mapa-2d').title).toContain('Mapa acústico 2D')
  })
})
