import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateStation, updateStationNameAuth } = vi.hoisted(() => ({
  updateStation: vi.fn(),
  updateStationNameAuth: vi.fn(),
}))

vi.mock('../api/admin', () => ({ updateStation, updateStationNameAuth }))

vi.mock('../components/admin/StationLocationPicker', () => ({
  default: ({ onPick }) => (
    <button type="button" onClick={() => onPick(4.7123456, -74.1234567)}>Mover punto de prueba</button>
  ),
}))

import { EditStationModal } from '../components/admin/EditStationModal'

const station = {
  stationCode: 'ST-FONTIBON-01',
  name: 'Estación Fontibón',
  description: 'Punto original',
  address: 'Calle 1',
  latitude: 4.65,
  longitude: -74.06,
}

describe('EditStationModal', () => {
  beforeEach(() => {
    updateStation.mockReset()
    updateStationNameAuth.mockReset()
  })

  it('actualiza las coordenadas al elegir un punto en el mapa y las guarda', async () => {
    const onSaved = vi.fn()
    updateStation.mockResolvedValue({ data: {} })
    updateStationNameAuth.mockResolvedValue({ data: {} })

    render(<EditStationModal station={station} onClose={vi.fn()} onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mover punto de prueba' }))
    expect(screen.getByLabelText('Latitud')).toHaveValue(4.712346)
    expect(screen.getByLabelText('Longitud')).toHaveValue(-74.123457)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateStation).toHaveBeenCalledWith('ST-FONTIBON-01', {
      name: 'Estación Fontibón',
      description: 'Punto original',
      address: 'Calle 1',
      latitude: 4.712346,
      longitude: -74.123457,
    }))
    expect(updateStationNameAuth).toHaveBeenCalledWith('ST-FONTIBON-01', 'Estación Fontibón')
    expect(onSaved).toHaveBeenCalledOnce()
  })
})
