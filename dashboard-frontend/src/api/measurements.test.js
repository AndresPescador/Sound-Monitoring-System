import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('./client', () => ({ default: { get } }))

import { getAllRawMeasurements } from './measurements'

describe('getAllRawMeasurements', () => {
  beforeEach(() => get.mockReset())

  it('follows cursors and reports progress for every page', async () => {
    get
      .mockResolvedValueOnce({ data: {
        data: [{ recorded_at: '2026-08-30T10:00:00Z' }],
        total_count: 2,
        has_more: true,
        next_cursor: '2026-08-30T10:00:00Z',
      } })
      .mockResolvedValueOnce({ data: {
        data: [{ recorded_at: '2026-08-30T10:01:00Z' }],
        total_count: 2,
        has_more: false,
        next_cursor: null,
      } })
    const progress = []

    const result = await getAllRawMeasurements(
      'ST-TEST-01',
      { from: '2026-08-30T10:00:00Z' },
      update => progress.push(update),
    )

    expect(get).toHaveBeenNthCalledWith(1, '/stations/ST-TEST-01/measurements/raw', {
      params: {
        from: '2026-08-30T10:00:00Z',
        limit: 1000,
      },
    })
    expect(get).toHaveBeenNthCalledWith(2, '/stations/ST-TEST-01/measurements/raw', {
      params: {
        from: '2026-08-30T10:00:00Z',
        limit: 1000,
        cursor: '2026-08-30T10:00:00Z',
      },
    })
    expect(result.data).toHaveLength(2)
    expect(progress.map(item => item.page)).toEqual([1, 2])
  })
})
