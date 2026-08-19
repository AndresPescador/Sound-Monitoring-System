import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Landing from './pages/Landing'
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

          {/* Landing pública de introducción */}
          <Route path="/" element={<Landing />} />

          {/* ── Dashboard público (con Layout) ───────────────────────── */}
          <Route element={<Layout />}>
            <Route path="/mapa-2d" element={<Home />} />
            <Route path="/stations/:code" element={<StationDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/data" element={<OpenData />} />
          </Route>

          {/* El visor ocupa toda la pantalla; no hereda navbar ni footer. */}
          <Route path="/urban-3d" element={
            <Suspense fallback={<p className="grid min-h-[100dvh] place-items-center bg-slate-950 text-sm text-white">Cargando visor 3D…</p>}>
              <UrbanTwin />
            </Suspense>
          } />

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
