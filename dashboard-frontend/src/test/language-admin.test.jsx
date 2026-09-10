import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'

const { login, registerStationAuth } = vi.hoisted(() => ({ login: vi.fn(), registerStationAuth: vi.fn() }))
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ login }) }))
vi.mock('../api/admin', () => ({ registerStationAuth }))
vi.mock('../components/shared/ThemeToggle', () => ({ default: () => null }))
vi.mock('../components/admin/StationLocationPicker', () => ({ default: ({ onPick }) => <button type="button" onClick={() => onPick(4.7, -74.1)}>Pick point</button> }))
import AdminLogin from '../pages/admin/AdminLogin'
import { CreateStationModal } from '../components/admin/CreateStationModal'

beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })
afterEach(() => localStorage.clear())

it('changes a visible login error and preserves credentials without another request', async () => {
  login.mockRejectedValue({ response: { data: { error: 'Credenciales inválidas.' } } })
  render(<LanguageProvider><MemoryRouter><AdminLogin /></MemoryRouter></LanguageProvider>)
  const username = screen.getByLabelText('Usuario'), password = screen.getByLabelText('Contraseña')
  fireEvent.change(username, { target: { value: 'fixture-user' } })
  fireEvent.change(password, { target: { value: 'fixture-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas.')
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials.')
  expect(screen.getByLabelText('Username')).toBe(username)
  expect(screen.getByLabelText('Password')).toBe(password)
  expect(password).toHaveValue('fixture-password')
  expect(login).toHaveBeenCalledTimes(1)
})

it('keeps wizard inputs and translates an in-flight operation inside the open modal', async () => {
  let finish
  registerStationAuth.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const onCreated = vi.fn()
  render(<LanguageProvider><CreateStationModal onClose={vi.fn()} onCreated={onCreated} /></LanguageProvider>)
  fireEvent.change(screen.getByLabelText('Localidad *'), { target: { value: 'Sopo' } })
  const name = screen.getByLabelText('Nombre de la estación *')
  fireEvent.change(name, { target: { value: 'Estación de prueba' } })
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  expect(screen.getByLabelText('Station name *')).toBe(name)
  expect(name).toHaveValue('Estación de prueba')
  fireEvent.click(screen.getByRole('button', { name: 'Continue to location' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pick point' }))
  fireEvent.click(screen.getByRole('button', { name: 'Create station' }))
  expect(screen.getByRole('button', { name: 'Creating credentials and provisioning…' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Español' }))
  expect(screen.getByRole('button', { name: 'Creando credenciales y aprovisionando…' })).toBeDisabled()
  expect(screen.getByLabelText('Latitud *')).toHaveValue(4.7)
  expect(registerStationAuth).toHaveBeenCalledTimes(1)
  expect(registerStationAuth.mock.calls[0][0]).toMatchObject({ name: 'Estación de prueba', latitude: 4.7, longitude: -74.1 })
  await act(async () => finish({ data: { stationCode: 'ST-TEST-01' } }))
  expect(onCreated).toHaveBeenCalledOnce()
})
