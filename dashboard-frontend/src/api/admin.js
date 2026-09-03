import adminClient from './adminClient'

// =============================================================================
// AUTENTICACIÓN
// =============================================================================

export const adminLogin = (username, password) =>
  adminClient.post('/auth/admin/login', { username, password })

export const getAdminMe = () =>
  adminClient.get('/auth/admin/me')

export const changeAdminPassword = (currentPassword, newPassword) =>
  adminClient.post('/auth/admin/change-password', { currentPassword, newPassword })

// =============================================================================
// GESTIÓN DE ADMINISTRADORES (solo super-admin)
// =============================================================================

export const listAdmins = () =>
  adminClient.get('/auth/admin/admins')

export const createAdmin = (username, password) =>
  adminClient.post('/auth/admin/admins', { username, password })

// =============================================================================
// GESTIÓN DE ESTACIONES — Auth Service (credenciales)
// =============================================================================

// Registra la estación en Auth Service. El backend genera el nombre y devuelve el secret UNA SOLA VEZ.
export const registerStationAuth = (data) =>
  adminClient.post('/auth/admin/stations', data)

// Rota el secret de una estación e invalida sus tokens activos.
export const rotateStationSecret = (stationCode) =>
  adminClient.post(`/auth/admin/stations/${stationCode}/rotate-secret`)

// Cambia el estado activo/inactivo en Auth Service
export const changeStationStatusAuth = (stationCode, active) =>
  adminClient.patch(`/auth/admin/stations/${stationCode}/status`, { active })

export const updateStationNameAuth = (stationCode, name) =>
  adminClient.put(`/auth/admin/stations/${stationCode}/name`, { name })

// Revoca tokens sin cambiar el secret
export const revokeStationTokens = (stationCode) =>
  adminClient.delete(`/auth/admin/stations/${stationCode}/token`)

// =============================================================================
// GESTIÓN DE ESTACIONES — Noise Processing (datos geográficos y métricas)
// =============================================================================

export const listStationsAdmin = () =>
  adminClient.get('/processing/admin/stations')

export const getStationAdmin = (stationCode) =>
  adminClient.get(`/processing/admin/stations/${stationCode}`)

// Registra la estación en Noise Processing con el nombre recibido de Auth (llamar DESPUÉS de registerStationAuth)
export const registerStationProcessing = (data) =>
  adminClient.post('/processing/admin/stations', data)

export const updateStation = (stationCode, data) =>
  adminClient.put(`/processing/admin/stations/${stationCode}`, data)

// Cambia el estado en Noise Processing (sincronizar con Auth)
export const changeStationStatusProcessing = (stationCode, active) =>
  adminClient.patch(`/processing/admin/stations/${stationCode}/status`, { active })

export const deleteStationProcessing = (stationCode) =>
  adminClient.delete(`/processing/admin/stations/${stationCode}`)
