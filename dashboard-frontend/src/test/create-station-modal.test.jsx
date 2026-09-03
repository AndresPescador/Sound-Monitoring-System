import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { registerStationAuth, registerStationProcessing, updateStationNameAuth } = vi.hoisted(() => ({
  registerStationAuth: vi.fn(),
  registerStationProcessing: vi.fn(),
  updateStationNameAuth: vi.fn(),
}))

vi.mock('../api/admin', () => ({
  registerStationAuth,
  registerStationProcessing,
  updateStationNameAuth,
}))

vi.mock('../components/admin/StationLocationPicker', () => ({
  default: ({ onPick }) => (
    <button type="button" onClick={() => onPick(4.7, -74.1)}>Elegir punto de prueba</button>
  ),
}))

import { CreateStationModal } from '../components/admin/CreateStationModal'

function renderModal(props = {}) {
  const defaults = {
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onPendingChange: vi.fn(),
    pendingRegistration: null,
  }
  return { ...defaults, ...props, ...render(<CreateStationModal {...defaults} {...props} />) }
}

describe('CreateStationModal', () => {
  beforeEach(() => {
    registerStationAuth.mockReset()
    registerStationProcessing.mockReset()
    updateStationNameAuth.mockReset()
  })

  it('guía la identidad y actualiza las coordenadas desde el mapa', () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Localidad *'), { target: { value: 'Fontibon' } })

    expect(screen.getByLabelText('Localidad *')).toHaveValue('Fontibón')
    expect(screen.getByText('Fontibón es una localidad de Bogotá.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre de la estación *')).toHaveValue('Estación Fontibón')
    expect(screen.getByText('ST-FONTIBON-##')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar a ubicación' }))

    expect(screen.getByRole('heading', { name: '¿Dónde está instalada?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir punto de prueba' }))
    expect(screen.getByLabelText('Latitud *')).toHaveValue(4.7)
    expect(screen.getByLabelText('Longitud *')).toHaveValue(-74.1)
  })

  it('envía el nombre y la ubicación seleccionados al completar el segundo paso', async () => {
    const onCreated = vi.fn()
    registerStationAuth.mockResolvedValue({
      data: {
        stationCode: 'ST-SOPO-01',
        locality: 'Sopo',
        name: 'Estación Sopo',
        secret: 'secret-only-for-test',
      },
    })
    registerStationProcessing.mockResolvedValue({ data: {} })

    renderModal({ onCreated })

    fireEvent.change(screen.getByLabelText('Localidad *'), { target: { value: 'Sopo' } })
    expect(screen.getByText('Se registrará como otra localidad y se generará su código interno.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a ubicación' }))
    fireEvent.click(screen.getByRole('button', { name: 'Elegir punto de prueba' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear estación' }))

    await waitFor(() => expect(registerStationProcessing).toHaveBeenCalledWith({
      stationCode: 'ST-SOPO-01',
      name: 'Estación Sopo',
      locality: 'Sopo',
      description: '',
      address: '',
      latitude: 4.7,
      longitude: -74.1,
    }))
    expect(registerStationAuth).toHaveBeenCalledWith({
      name: 'Estación Sopo',
      locality: 'Sopo',
      description: '',
    })
    expect(onCreated).toHaveBeenCalledWith('secret-only-for-test', 'ST-SOPO-01')
  })
})
