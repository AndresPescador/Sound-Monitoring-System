import { Link, Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="dashboard-shell">
      <Navbar />
      <main className="dashboard-main">
        <Outlet />
      </main>
      <footer className="dashboard-footer">
        <span className="dashboard-footer__brand">Monitoreo Acústico · Bogotá D.C.</span>
        <p className="dashboard-footer__copy">Datos acústicos binaurales para explorar la ciudad.</p>
        <nav className="dashboard-footer__links" aria-label="Enlaces del pie de página">
          <Link to="/">Presentación</Link>
          <Link to="/data">Datos abiertos</Link>
        </nav>
      </footer>
    </div>
  )
}
