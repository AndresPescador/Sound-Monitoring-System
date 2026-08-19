import { Link, Outlet } from 'react-router-dom'
import { ROUTES } from '../../routes'
import Map2DNavbar from './Map2DNavbar'

export default function Map2DLayout() {
  return (
    <div className="dashboard-shell">
      <Map2DNavbar />
      <main className="dashboard-main">
        <Outlet />
      </main>
      <footer className="dashboard-footer">
        <span className="dashboard-footer__brand">Monitoreo Acústico · Experiencia 2D</span>
        <p className="dashboard-footer__copy">Mapa, análisis por estación, comparaciones y datos abiertos.</p>
        <nav className="dashboard-footer__links" aria-label="Enlaces del pie de página">
          <Link to={ROUTES.landing}>Presentación</Link>
          <Link to={ROUTES.map2DData}>Datos abiertos</Link>
        </nav>
      </footer>
    </div>
  )
}
