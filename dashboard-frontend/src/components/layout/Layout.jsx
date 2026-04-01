import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Navbar />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-screen-2xl mx-auto w-full">
        <Outlet />
      </main>
      <footer className="border-t border-border py-3 text-center text-xs text-text-light font-mono">
        Sistema de Monitoreo Acústico Binaural · Bogotá D.C. · {new Date().getFullYear()}
      </footer>
    </div>
  )
}
