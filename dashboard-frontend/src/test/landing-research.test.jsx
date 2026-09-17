import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import { ThemeProvider } from '../context/ThemeContext'
import Landing from '../pages/Landing'

function renderLanding() {
  return render(
    <LanguageProvider>
      <ThemeProvider>
        <MemoryRouter>
          <Landing />
        </MemoryRouter>
      </ThemeProvider>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('landing research and authorship', () => {
  it('links the navigation to the research section and exposes both groups', () => {
    const scroll = vi.spyOn(window, 'scrollTo')
    renderLanding()

    const researchLink = screen.getByRole('link', { name: 'Investigación' })
    expect(researchLink).toHaveAttribute('href', '#investigacion')
    fireEvent.click(researchLink)
    expect(window.location.hash).toBe('#investigacion')
    expect(scroll).toHaveBeenCalled()

    expect(screen.getByRole('heading', { name: 'Investigación y autoría' })).toBeInTheDocument()
    expect(screen.getByRole('heading', {
      name: 'Grupo de Investigación en Gestión e Investigación en Informática, Redes y Afines',
    })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Conocer MULTIAD' })).toHaveClass('landing-button', 'landing-button--light')
    expect(screen.getByRole('link', { name: 'Conocer MULTIAD' })).toHaveAttribute(
      'href',
      'https://pi.udistrital.edu.co/Multimedia-Interactiva-Animacion-Digital/',
    )
    expect(screen.getByRole('link', { name: 'Conocer GIIRA' })).toHaveClass('landing-button', 'landing-button--light')
    expect(screen.getByRole('link', { name: 'Conocer GIIRA' })).toHaveAttribute(
      'href',
      'https://pi.udistrital.edu.co/GIIRA/',
    )

    const multiadLogo = document.querySelector('img[src="/assets/logo-multiad.png"]')
    const giiraLogo = document.querySelector('img[src="/assets/logo-giira.png"]')
    expect(multiadLogo).toHaveAttribute('alt', '')
    expect(multiadLogo).toHaveAttribute('width', '261')
    expect(giiraLogo).toHaveAttribute('alt', '')
    expect(giiraLogo).toHaveAttribute('width', '1076')
  })

  it('frames the research heading directly below the sticky header', () => {
    const scroll = vi.spyOn(window, 'scrollTo')
    renderLanding()

    const header = document.querySelector('.landing-nav')
    const heading = document.querySelector('.landing-research__heading')
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ height: 104 })
    vi.spyOn(heading, 'offsetTop', 'get').mockReturnValue(1600)
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(4000)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)

    fireEvent.click(screen.getByRole('link', { name: 'Investigación' }))

    expect(scroll).toHaveBeenLastCalledWith({ top: 1444, behavior: 'smooth' })
  })

  it('leaves a visual gap below the sticky header when framing the station', () => {
    const scroll = vi.spyOn(window, 'scrollTo')
    renderLanding()

    const header = document.querySelector('.landing-nav')
    const stationMedia = document.querySelector('.landing-field-media')
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ height: 72 })
    vi.spyOn(stationMedia, 'offsetTop', 'get').mockReturnValue(2400)
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(5000)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1920)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(968)

    fireEvent.click(screen.getByRole('link', { name: 'Estación' }))

    expect(scroll).toHaveBeenLastCalledWith({ top: 2300, behavior: 'smooth' })
  })

  it('publishes the complete author credit and contact links', () => {
    renderLanding()

    expect(screen.getByRole('heading', { name: 'Carlos Andres Pescador Castro' })).toBeInTheDocument()
    expect(screen.getByText('Autor y desarrollador del proyecto · Ingeniería de Sistemas')).toBeInTheDocument()
    expect(screen.getByText(/Responsable del desarrollo integral del sistema/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveClass('landing-button', 'landing-author__github-button')
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/AndresPescador')
    expect(screen.getByRole('link', { name: 'capescadorc@udistrital.edu.co' })).toHaveAttribute(
      'href',
      'mailto:capescadorc@udistrital.edu.co',
    )
    expect(screen.getByText('Desarrollado por Carlos Andres Pescador Castro.')).toBeInTheDocument()
  })

  it('translates the new navigation and content to English', () => {
    localStorage.setItem('sound-monitoring-language', 'en')
    renderLanding()

    expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute('href', '#investigacion')
    expect(screen.getByRole('heading', { name: 'Research and authorship' })).toBeInTheDocument()
    expect(screen.getByText('Project author and developer · Systems Engineering')).toBeInTheDocument()
  })
})
