import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { adminLogin as apiLogin, getAdminMe } from '../api/admin'

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const [user, setUser]       = useState(null)   // { username, superAdmin, lastLoginAt }
  const [loading, setLoading] = useState(true)   // true mientras verifica sesión inicial

  // Verificar sesión existente al montar (hay token en sessionStorage)
  useEffect(() => {
    const token = sessionStorage.getItem('adminToken')
    if (!token) {
      setLoading(false)
      return
    }
    getAdminMe()
      .then(res => setUser(res.data))
      .catch(() => {
        // Token inválido o expirado — limpiar
        sessionStorage.removeItem('adminToken')
        sessionStorage.removeItem('adminUser')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const res = await apiLogin(username, password)
    sessionStorage.setItem('adminToken', res.data.accessToken)
    setUser({
      username:   res.data.username,
      superAdmin: res.data.superAdmin,
    })
    return res.data
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem('adminToken')
    sessionStorage.removeItem('adminUser')
    setUser(null)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth debe usarse dentro de AdminAuthProvider')
  return ctx
}
