import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseEntries, useHistory } from './useHistory.ts'
import type { ScanEntry } from '../lib/types.ts'

const KEY = 'sold.history.v1'

const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as ScanEntry[] | null

beforeEach(() => {
  localStorage.clear()
})

describe('parseEntries', () => {
  it('drops records that are not the shape we wrote', () => {
    const entries = parseEntries([
      { code: '1', label: 'Real', at: 1 },
      { code: 2, label: 'Wrong type', at: 2 },
      { label: 'No code', at: 3 },
      null,
      'nonsense',
      { code: '4', label: 'Bad timestamp', at: 'yesterday' },
    ])
    expect(entries).toEqual([{ code: '1', label: 'Real', at: 1 }])
  })

  it('survives a stored value that is not a list at all', () => {
    expect(parseEntries({ oops: true })).toEqual([])
    expect(parseEntries(null)).toEqual([])
  })
})

describe('useHistory', () => {
  it('puts the newest scan first and persists it', () => {
    const { result } = renderHook(() => useHistory())

    act(() => result.current.record('5000157024671', 'Heinz Beans'))
    act(() => result.current.record('0045496453435', 'Nintendo Switch'))

    expect(result.current.entries.map((entry) => entry.label)).toEqual([
      'Nintendo Switch',
      'Heinz Beans',
    ])
    expect(stored()).toHaveLength(2)
  })

  it('moves a repeat lookup back to the top rather than duplicating it', () => {
    const { result } = renderHook(() => useHistory())

    act(() => result.current.record('1', 'Beans'))
    act(() => result.current.record('2', 'Switch'))
    act(() => result.current.record('1', 'Beans'))

    expect(result.current.entries.map((entry) => entry.label)).toEqual(['Beans', 'Switch'])
  })

  it('keeps only the most recent forty', () => {
    const { result } = renderHook(() => useHistory())

    act(() => {
      for (let i = 0; i < 45; i += 1) result.current.record(String(i), `Item ${i}`)
    })

    expect(result.current.entries).toHaveLength(40)
    expect(result.current.entries[0].label).toBe('Item 44')
  })

  it('removes a single row without touching the rest', () => {
    const { result } = renderHook(() => useHistory())

    act(() => result.current.record('1', 'Beans'))
    act(() => result.current.record('2', 'Switch'))
    const target = result.current.entries[0]
    act(() => result.current.remove(target))

    expect(result.current.entries.map((entry) => entry.label)).toEqual(['Beans'])
    expect(stored()).toHaveLength(1)
  })

  it('clears everything', () => {
    const { result } = renderHook(() => useHistory())
    act(() => result.current.record('1', 'Beans'))
    act(() => result.current.clear())

    expect(result.current.entries).toEqual([])
    expect(stored()).toEqual([])
  })

  it('reads what is already on the device', () => {
    localStorage.setItem(KEY, JSON.stringify([{ code: '1', label: 'Beans', at: 10 }]))
    const { result } = renderHook(() => useHistory())
    expect(result.current.entries).toEqual([{ code: '1', label: 'Beans', at: 10 }])
  })

  it('ignores a corrupt store instead of failing to render', () => {
    localStorage.setItem(KEY, '{ not json')
    const { result } = renderHook(() => useHistory())
    expect(result.current.entries).toEqual([])
  })

  /** Two tabs open is normal: one scanning, one holding an eBay result. */
  it('picks up a change another tab made', () => {
    const { result } = renderHook(() => useHistory())
    act(() => result.current.record('1', 'Beans'))

    const fromOtherTab = [{ code: '9', label: 'Scanned elsewhere', at: 99 }]
    act(() => {
      localStorage.setItem(KEY, JSON.stringify(fromOtherTab))
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    })

    expect(result.current.entries).toEqual(fromOtherTab)
    // And we must not write it straight back, or the two tabs echo forever.
    expect(stored()).toEqual(fromOtherTab)
  })
})
