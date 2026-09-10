import { message } from './core.mjs'

const knownMessages = {
  "Credenciales inválidas.": "admin.credentials_invalid",
  "Token inválido o expirado.": "admin.session_expired",
  "El password actual es incorrecto.": "admin.current_password_incorrect",
  "La sesión administrativa fue revocada.": "admin.session_revoked",
  "Datos inválidos.": "admin.invalid_data",
  "El código interno ya está en uso. Intenta crear la estación nuevamente.": "admin.internal_code_in_use",
  "No tienes permisos para realizar esta operación.": "admin.permission_denied",
  "Demasiados intentos. Espera antes de reintentar.": "admin.rate_limited",
  "Credenciales creadas; aprovisionamiento en Processing pendiente.": "admin.provisioning_pending",
  "Cambios sincronizados correctamente.": "admin.changes_synced",
  "Cambios guardados; la sincronización con Processing está pendiente.": "admin.changes_pending",
  "Sincronización completada.": "admin.sync_completed",
  "Sincronización reprogramada.": "admin.sync_rescheduled",
  "Estación y datos analíticos eliminados correctamente.": "admin.deletion_completed",
  "La estación quedó bloqueada; Processing rechazó la purga y requiere revisión.": "admin.deletion_failed",
  "La estación quedó bloqueada y la purga continuará automáticamente.": "admin.deletion_pending",
  "Operación completada.": "admin.operation_completed",
  "Processing volvió a rechazar la operación; revisa el conflicto antes de reintentar.": "admin.operation_failed",
  "Operación reprogramada.": "admin.operation_rescheduled",
  "La operación requiere revisión. Comprueba el estado de sincronización antes de reintentar.": "admin.operation_review",
  "Configura el nuevo secret en la estación. Comprueba el estado de aprovisionamiento antes de utilizarla.": "admin.secret_rotation_notice",
  "No se puede rotar el secret durante la eliminación.": "admin.rotation_during_deletion",
  "No hay una sincronización pendiente para esta estación.": "admin.no_pending_sync",
  "pendiente": "admin.operation_pending",
  "en curso": "admin.operation_running",
  "completada": "admin.operation_status_completed",
  "fallida": "admin.operation_status_failed",
  "en espera de reintento": "admin.operation_retry",
  "en revisión": "admin.operation_unknown"
}

export function serverMessage(value, fallbackKey = 'admin.operation_review') {
  if (typeof value !== 'string') return message(fallbackKey)
  if (knownMessages[value]) return message(knownMessages[value])
  if (value.startsWith('Ya existe un administrador con el username:')) return message('admin.username_exists')
  const rotated = /^Secret rotado\. Tokens anteriores revocados: (\d+)\. Configura este secret en la estación\. No se volverá a mostrar\.$/.exec(value)
  if (rotated) return message('admin.secret_rotated', { count: rotated[1] })
  return message(fallbackKey)
}

export function operationError(error, fallbackKey) {
  const value = error?.response?.data?.error
  if (typeof value === 'string' && (knownMessages[value] || value.startsWith('Ya existe un administrador con el username:'))) return serverMessage(value, fallbackKey)
  if (error?.response?.status === 429) return message('admin.rate_limited')
  if (error?.response?.status === 403) return message('admin.permission_denied')
  return message(fallbackKey)
}

export function operationStatus(status) {
  return message({
    PENDING: 'admin.operation_pending', IN_PROGRESS: 'admin.operation_running',
    COMPLETED: 'admin.operation_status_completed', FAILED: 'admin.operation_status_failed',
    RETRY: 'admin.operation_retry', RETRY_PENDING: 'admin.operation_retry',
  }[status] ?? 'admin.operation_unknown')
}
