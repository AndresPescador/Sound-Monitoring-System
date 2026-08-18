import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Home from './pages/Home'
import StationDetail from './pages/StationDetail'
import Compare from './pages/Compare'
import OpenData from './pages/OpenData'

import AdminLogin from './pages/admin/AdminLogin'
import AdminStations from './pages/admin/AdminStations'
import AdminProfile from './pages/admin/AdminProfile'
import AdminUsers from './pages/admin/AdminUsers'
import { AdminAuthProvider } from './context/AdminAuthContext'
import PrivateAdminRoute from './components/admin/PrivateAdminRoute'

// Deck.gl es pesado: se descarga solo cuando el usuario abre el visor 3D.
const UrbanTwin = lazy(() => import('./pages/UrbanTwin'))

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <Routes>

          {/* ── Dashboard público (con Layout) ───────────────────────── */}
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/stations/:code" element={<StationDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/data" element={<OpenData />} />
            <Route path="/urban-3d" element={
              <Suspense fallback={<p className="py-16 text-center text-sm text-text-muted">Cargando visor 3D…</p>}>
                <UrbanTwin />
              </Suspense>
            } />
          </Route>

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
