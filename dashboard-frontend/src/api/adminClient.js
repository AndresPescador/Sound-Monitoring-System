// Cliente Axios separado para el panel de administración.

import axios from 'axios'

const adminClient = axios.create({
  timeout: 15000,
})

// ── Interceptor de request: adjunta el token a cada petición ──────────────────
adminClient.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('adminToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Interceptor de response: redirige al login si el token expira ─────────────
adminClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('adminToken')
      sessionStorage.removeItem('adminUser')
      // Solo redirigir si estamos dentro del panel admin (nunca desde
      // el dashboard público, que no debe depender de la sesión admin).
      const path = window.location.pathname
      if (path.startsWith('/admin') && !path.includes('/admin/login')) {
        window.location.href = '/admin/login'
      }
    }
    return Promise.reject(error)
  }
)

export default adminClient
