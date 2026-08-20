import { useLocation } from 'react-router-dom'

export default function SkipLink() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/admin')) return null

  const focusContent = event => {
    const main = document.getElementById('main-content')
    const target = main?.querySelector('h1') ?? main
    if (!main || !target) return
    event.preventDefault()
    main.scrollIntoView({ block: 'start' })
    target.focus({ preventScroll: true })
  }

  return (
    <a
      className="skip-link"
      href="#main-content"
      onClick={focusContent}
      onMouseUp={event => { if (event.button === 0) focusContent(event) }}
      onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') focusContent(event) }}
    >
      Saltar al contenido principal
    </a>
  )
}
