import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { adminLogin, getAdminMe } = vi.hoisted(() => ({
  adminLogin: vi.fn(),
  getAdminMe: vi.fn(),
}))

vi.mock('../api/admin', () => ({ adminLogin, getAdminMe }))

import { AdminAuthProvider, useAdminAuth } from '../context/AdminAuthContext'

function Probe() {
  const { user, loading, login, logout } = useAdminAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.username ?? 'anonymous'}</span>
      <button onClick={() => login('admin', 'password')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

describe('AdminAuthProvider', () => {
  beforeEach(() => {
    sessionStorage.clear()
    adminLogin.mockReset()
    getAdminMe.mockReset()
  })

  it('finishes initial loading without a stored token', async () => {
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('user')).toHaveTextContent('anonymous')
    expect(getAdminMe).not.toHaveBeenCalled()
  })

  it('restores a stored session and clears it when the session is invalid', async () => {
    sessionStorage.setItem('adminToken', 'expired-token')
    getAdminMe.mockRejectedValueOnce(new Error('expired'))

    render(<AdminAuthProvider><Probe /></AdminAuthProvider>)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(sessionStorage.getItem('adminToken')).toBeNull()
    expect(screen.getByTestId('user')).toHaveTextContent('anonymous')
  })

  it('stores the access token on login and supports logout', async () => {
    adminLogin.mockResolvedValueOnce({
      data: { accessToken: 'new-token', username: 'admin', superAdmin: true },
    })
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'login' })))

    expect(adminLogin).toHaveBeenCalledWith('admin', 'password')
    expect(sessionStorage.getItem('adminToken')).toBe('new-token')
    expect(screen.getByTestId('user')).toHaveTextContent('admin')

    fireEvent.click(screen.getByRole('button', { name: 'logout' }))
    expect(sessionStorage.getItem('adminToken')).toBeNull()
    expect(screen.getByTestId('user')).toHaveTextContent('anonymous')
  })
})
