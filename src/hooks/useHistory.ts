import { useCallback, useEffect, useRef, useState } from 'react'
import { readStore, writeStore } from '../lib/storage.ts'
import type { ScanEntry } from '../lib/types.ts'

const KEY = 'sold.history.v1'
const LIMIT = 40

/**
 * localStorage is shared with anything else on the origin and survives every
 * deploy, so treat what comes back as untrusted input rather than as our own
 * data. One bad record should cost one row, not the whole list.
 */
export function parseEntries(value: unknown): ScanEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is ScanEntry => {
      if (typeof entry !== 'object' || entry === null) return false
      const { code, label, at } = entry as Partial<ScanEntry>
      return typeof code === 'string' && typeof label === 'string' && Number.isFinite(at)
    })
    .slice(0, LIMIT)
}

function load(): ScanEntry[] {
  return parseEntries(readStore<unknown>(KEY, []))
}

export function useHistory() {
  const [entries, setEntries] = useState<ScanEntry[]>(load)
  const loaded = useRef(false)
  const adopted = useRef(false)

  // State updaters have to be pure: React may run them more than once, and in
  // development StrictMode deliberately does. localStorage writes are
  // synchronous, so they belong out here rather than inside the updater.
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      return
    }
    // A list we just took from another tab is already stored. Writing it back
    // would only start the two tabs echoing at each other.
    if (adopted.current) {
      adopted.current = false
      return
    }
    writeStore(KEY, entries)
  }, [entries])

  // Two tabs open on a phone is normal: one to scan, one holding an eBay
  // result. Without this they overwrite each other's history.
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      // A null key means the whole store was cleared.
      if (event.key !== null && event.key !== KEY) return
      adopted.current = true
      setEntries(load())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const record = useCallback((code: string, label: string) => {
    setEntries((current) => {
      const kept = current.filter((entry) => entry.label !== label)
      return [{ code, label, at: Date.now() }, ...kept].slice(0, LIMIT)
    })
  }, [])

  const clear = useCallback(() => setEntries([]), [])

  return { entries, record, clear }
}
