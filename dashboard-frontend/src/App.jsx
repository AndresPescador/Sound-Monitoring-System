import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Map2DLayout from './components/map2d/Map2DLayout'
import Landing from './pages/Landing'
import Home from './pages/Home'
import StationDetail from './pages/StationDetail'

import AdminLogin from './pages/admin/AdminLogin'
import AdminStations from './pages/admin/AdminStations'
import AdminProfile from './pages/admin/AdminProfile'
import AdminUsers from './pages/admin/AdminUsers'
import { AdminAuthProvider } from './context/AdminAuthContext'
import PrivateAdminRoute from './components/admin/PrivateAdminRoute'
import { ROUTES, map2DStationPath } from './routes'

// Deck.gl es pesado: se descarga solo cuando el usuario abre el mapa 3D.
const UrbanTwin = lazy(() => import('./pages/UrbanTwin'))
const Compare = lazy(() => import('./pages/Compare'))
const OpenData = lazy(() => import('./pages/OpenData'))
const Map3DCompareRoute = lazy(() => import('./components/map3d/Map3DCompareRoute'))
const Map3DDataRoute = lazy(() => import('./components/map3d/Map3DDataRoute'))

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
        <Routes>

          {/* Landing pública de introducción */}
          <Route path={ROUTES.landing} element={<Landing />} />

          {/* ── Experiencia 2D: todas sus herramientas comparten layout y namespace ── */}
          <Route path={ROUTES.map2D} element={<Map2DLayout />}>
            <Route index element={<Home />} />
            <Route path="stations/:code" element={<StationDetail />} />
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
            <Route path="compare" element={<Suspense fallback={<RouteLoading label="Cargando comparación..." />}><Map3DCompareRoute /></Suspense>} />
            <Route path="data" element={<Suspense fallback={<RouteLoading label="Cargando datos abiertos..." />}><Map3DDataRoute /></Suspense>} />
          </Route>

          {/* Compatibilidad con enlaces guardados antes de separar las experiencias. */}
          <Route path="/stations/:code" element={<LegacyStationRedirect />} />
          <Route path="/compare" element={<Navigate to={ROUTES.map2DCompare} replace />} />
          <Route path="/data" element={<Navigate to={ROUTES.map2DData} replace />} />
          <Route path="/urban-3d" element={<Navigate to={ROUTES.map3D} replace />} />

          {/* ── Panel admin (SIN Layout, usa AdminLayout dentro) ────────── */}
          <Route path="/admin/login" element={<AdminLogin />} />

          <Route path="/admin" element={
            <PrivateAdminRoute><Navigate to="/admin/stations" replace /></PrivateAdminRoute>
          } />

          <Route path="/admin/stations" element={
            <PrivateAdminRoute><AdminStations /></PrivateAdminRoute>
          } />

          <Route path="/admin/profile" element={
            <PrivateAdminRoute><AdminProfile /></PrivateAdminRoute>
          } />

          <Route path="/admin/users" element={
            <PrivateAdminRoute><AdminUsers /></PrivateAdminRoute>
          } />

        </Routes>
      </AdminAuthProvider>
    </BrowserRouter>
  )
}
