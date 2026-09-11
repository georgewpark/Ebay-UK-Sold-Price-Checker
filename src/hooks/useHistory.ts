import { useCallback, useEffect, useRef, useState } from 'react'
import { readStore, writeStore } from '../lib/storage.ts'
import type { ScanEntry } from '../lib/types.ts'

const KEY = 'sold.history.v1'
const LIMIT = 40

export function useHistory() {
  const [entries, setEntries] = useState<ScanEntry[]>(() => readStore<ScanEntry[]>(KEY, []))
  const loaded = useRef(false)

  // State updaters have to be pure: React may run them more than once, and in
  // development StrictMode deliberately does. localStorage writes are
  // synchronous, so they belong out here rather than inside the updater.
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      return
    }
    writeStore(KEY, entries)
  }, [entries])

  const record = useCallback((code: string, label: string) => {
    setEntries((current) => {
      const kept = current.filter((entry) => entry.label !== label)
      return [{ code, label, at: Date.now() }, ...kept].slice(0, LIMIT)
    })
  }, [])

  const clear = useCallback(() => setEntries([]), [])

  return { entries, record, clear }
}
