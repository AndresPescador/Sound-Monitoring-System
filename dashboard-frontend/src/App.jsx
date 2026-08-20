import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Landing from './pages/Landing'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { ROUTES, map2DStationPath } from './routes'
import SkipLink from './components/shared/SkipLink'
import RouteNavigationManager from './components/shared/RouteNavigationManager'

// Cada experiencia y herramienta pesada se descarga solo al visitar su ruta.
const Map2DLayout = lazy(() => import('./components/map2d/Map2DLayout'))
const Home = lazy(() => import('./pages/Home'))
const StationDetail = lazy(() => import('./pages/StationDetail'))
const UrbanTwin = lazy(() => import('./pages/UrbanTwin'))
const Compare = lazy(() => import('./pages/Compare'))
const OpenData = lazy(() => import('./pages/OpenData'))
const Map3DDataRoute = lazy(() => import('./components/map3d/Map3DDataRoute'))
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AdminStations = lazy(() => import('./pages/admin/AdminStations'))
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const PrivateAdminRoute = lazy(() => import('./components/admin/PrivateAdminRoute'))

function RouteLoading({ label = 'Cargando vista...' }) {
  return <div className="map3d-route-loading" role="status" aria-live="polite">{label}</div>
}

function LegacyStationRedirect() {
  const { code } = useParams()
  return <Navigate to={map2DStationPath(code)} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <SkipLink />
        <RouteNavigationManager />
        <Routes>

          {/* Landing pública de introducción */}
          <Route path={ROUTES.landing} element={<Landing />} />

          {/* ── Experiencia 2D: todas sus herramientas comparten layout y namespace ── */}
          <Route path={ROUTES.map2D} element={<Suspense fallback={<RouteLoading />}><Map2DLayout /></Suspense>}>
            <Route index element={<Suspense fallback={<RouteLoading />}><Home /></Suspense>} />
            <Route path="stations/:code" element={<Suspense fallback={<RouteLoading />}><StationDetail /></Suspense>} />
            <Route path="compare" element={<Suspense fallback={<RouteLoading />}><Compare /></Suspense>} />
            <Route path="data" element={<Suspense fallback={<RouteLoading />}><OpenData /></Suspense>} />
          </Route>

          {/* ── Experiencia 3D: el layout mantiene el mapa montado entre rutas ── */}
          <Route path={ROUTES.map3D} element={
            <Suspense fallback={<RouteLoading label="Cargando mapa 3D..." />}>
              <UrbanTwin />
            </Suspense>
          }>
            <Route index element={null} />
            {/* La ruta conserva la estación enfocada en el mapa, pero el detalle completo vive en la experiencia 2D. */}
            <Route path="stations/:code" element={null} />
            {/* Comparar pertenece a la experiencia 2D; los enlaces 3D antiguos vuelven al mapa. */}
            <Route path="compare" element={<Navigate to={ROUTES.map3D} replace />} />
            <Route path="data" element={<Suspense fallback={<RouteLoading label="Cargando datos abiertos..." />}><Map3DDataRoute /></Suspense>} />
          </Route>

          {/* Compatibilidad con enlaces guardados antes de separar las experiencias. */}
          <Route path="/stations/:code" element={<LegacyStationRedirect />} />
          <Route path="/compare" element={<Navigate to={ROUTES.map2DCompare} replace />} />
          <Route path="/data" element={<Navigate to={ROUTES.map2DData} replace />} />
          <Route path="/urban-3d" element={<Navigate to={ROUTES.map3D} replace />} />

          {/* ── Panel admin (SIN Layout, usa AdminLayout dentro) ────────── */}
          <Route path="/admin/login" element={<Suspense fallback={<RouteLoading />}><AdminLogin /></Suspense>} />

          <Route path="/admin" element={
            <Suspense fallback={<RouteLoading />}><PrivateAdminRoute><Navigate to="/admin/stations" replace /></PrivateAdminRoute></Suspense>
          } />

          <Route path="/admin/stations" element={
            <Suspense fallback={<RouteLoading />}><PrivateAdminRoute><AdminStations /></PrivateAdminRoute></Suspense>
          } />

          <Route path="/admin/profile" element={
            <Suspense fallback={<RouteLoading />}><PrivateAdminRoute><AdminProfile /></PrivateAdminRoute></Suspense>
          } />

          <Route path="/admin/users" element={
            <Suspense fallback={<RouteLoading />}><PrivateAdminRoute><AdminUsers /></PrivateAdminRoute></Suspense>
          } />

        </Routes>
      </AdminAuthProvider>
    </BrowserRouter>
  )
}
