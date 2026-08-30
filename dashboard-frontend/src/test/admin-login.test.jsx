import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { login } = vi.hoisted(() => ({ login: vi.fn() }))
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ login }) }))
vi.mock('../components/shared/ThemeToggle', () => ({ default: () => null }))

import AdminLogin from '../pages/admin/AdminLogin'

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/admin/login']}>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/stations" element={<p>stations page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminLogin', () => {
  beforeEach(() => login.mockReset())

  it('submits credentials and navigates to stations on success', async () => {
    login.mockResolvedValueOnce({ accessToken: 'token' })
    renderLogin()

    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => expect(screen.getByText('stations page')).toBeInTheDocument())
    expect(login).toHaveBeenCalledWith('admin', 'password')
  })

  it('renders the backend error without exposing an implementation detail', async () => {
    login.mockRejectedValueOnce({ response: { data: { error: 'Credenciales inválidas.' } } })
    renderLogin()

    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas.')
  })
})
