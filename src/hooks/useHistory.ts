import { useCallback, useState } from 'react'
import { readStore, writeStore } from '../lib/storage.ts'
import type { ScanEntry } from '../lib/types.ts'

const KEY = 'sold.history.v1'
const LIMIT = 40

export function useHistory() {
  const [entries, setEntries] = useState<ScanEntry[]>(() => readStore<ScanEntry[]>(KEY, []))

  const record = useCallback((code: string, label: string) => {
    setEntries((current) => {
      const next = [{ code, label, at: Date.now() }, ...current.filter((e) => e.label !== label)]
        .slice(0, LIMIT)
      writeStore(KEY, next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setEntries([])
    writeStore(KEY, [])
  }, [])

  return { entries, record, clear }
}
