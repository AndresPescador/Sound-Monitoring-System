import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useAdminAuth } = vi.hoisted(() => ({ useAdminAuth: vi.fn() }))
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth }))

import PrivateAdminRoute from '../components/admin/PrivateAdminRoute'

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/admin/stations']}>
      <Routes>
        <Route path="/admin/stations" element={<PrivateAdminRoute><p>private content</p></PrivateAdminRoute>} />
        <Route path="/admin/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PrivateAdminRoute', () => {
  beforeEach(() => useAdminAuth.mockReset())

  it('does not redirect while the session is being checked', () => {
    useAdminAuth.mockReturnValue({ loading: true, user: null })
    renderRoute()

    expect(screen.getByRole('status')).toHaveTextContent('Verificando sesión')
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
  })

  it('redirects unauthenticated users to the admin login', () => {
    useAdminAuth.mockReturnValue({ loading: false, user: null })
    renderRoute()

    expect(screen.getByText('login page')).toBeInTheDocument()
    expect(screen.queryByText('private content')).not.toBeInTheDocument()
  })

  it('renders protected content for an authenticated user', () => {
    useAdminAuth.mockReturnValue({ loading: false, user: { username: 'admin' } })
    renderRoute()

    expect(screen.getByText('private content')).toBeInTheDocument()
  })
})
