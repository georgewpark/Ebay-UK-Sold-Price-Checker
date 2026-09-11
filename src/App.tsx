import { useCallback, useEffect, useRef, useState } from 'react'
import Masthead from './components/Masthead.tsx'
import OfflineBanner from './components/OfflineBanner.tsx'
import Viewfinder from './components/Viewfinder.tsx'
import SearchPanel from './components/SearchPanel.tsx'
import History from './components/History.tsx'
import { useHistory } from './hooks/useHistory.ts'
import { useOnline } from './hooks/useOnline.ts'
import { useScanner } from './hooks/useScanner.ts'
import { warmDecoder } from './lib/decoder.ts'
import { ebayUrl, openTab } from './lib/ebay.ts'
import { lookupName } from './lib/lookup.ts'
import { NO_STATUS, describeLookup, recalled, scanned } from './lib/status.ts'
import type { ScanEntry, ScanStatus } from './lib/types.ts'

export default function App() {
  const [code, setCode] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState<ScanStatus>(NO_STATUS)
  const [flashKey, setFlashKey] = useState(0)

  const online = useOnline()
  const { entries, record, clear } = useHistory()
  const lookup = useRef<AbortController | null>(null)
  const termRef = useRef<HTMLInputElement>(null)

  // Warm the barcode reader while the user is still reading the page. On the
  // fallback path this also pulls the WASM binary down behind it, so the slow
  // browsers stop paying for it at the moment the camera opens.
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warmDecoder)
      return () => window.cancelIdleCallback?.(handle)
    }
    const timer = setTimeout(warmDecoder, 1200)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => () => lookup.current?.abort(), [])

  const handleDetect = useCallback(
    (value: string) => {
      setFlashKey((key) => key + 1)
      navigator.vibrate?.(45)

      lookup.current?.abort()
      const attempt = new AbortController()
      lookup.current = attempt

      setCode(value)
      setTerm(value)
      setStatus(scanned(value))

      void lookupName(value, attempt.signal).then((result) => {
        if (attempt.signal.aborted) return
        if (result.name) setTerm(result.name)
        setStatus(describeLookup(result, value))
        record(value, result.name ?? value)
      })
    },
    [record],
  )

  const scanner = useScanner(handleDetect)

  const search = useCallback(
    (sold: boolean) => {
      const query = term.trim()
      if (!query || !online) return
      record(code || query, query)
      openTab(ebayUrl(query, sold))
    },
    [code, online, record, term],
  )

  const onSold = useCallback(() => search(true), [search])
  const onLive = useCallback(() => search(false), [search])

  const recall = useCallback((entry: ScanEntry) => {
    // A lookup still in flight from the last scan would otherwise land on top
    // of the entry the user just picked.
    lookup.current?.abort()

    setCode(entry.code)
    setTerm(entry.label)
    setStatus(recalled(entry.label))

    termRef.current?.focus({ preventScroll: true })
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
  }, [])

  const toggleScan = useCallback(() => {
    if (scanner.status === 'scanning') {
      scanner.stop()
    } else {
      void scanner.start()
    }
  }, [scanner])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-120 flex-col gap-3 px-4 pb-10 pt-5">
      <Masthead />
      <OfflineBanner online={online} />

      <main className="flex flex-col gap-3">
        <Viewfinder
          videoRef={scanner.videoRef}
          status={scanner.status}
          notice={scanner.notice}
          flashKey={flashKey}
          torch={scanner.torch}
          keepScanning={scanner.keepScanning}
          onToggleScan={toggleScan}
        />

        <SearchPanel
          code={code}
          status={status}
          term={term}
          termRef={termRef}
          online={online}
          onTermChange={setTerm}
          onSold={onSold}
          onLive={onLive}
        />

        <History entries={entries} onRecall={recall} onClear={clear} />
      </main>

      <p className="px-1 pt-1 text-[12px] leading-relaxed text-muted">
        Searches run on eBay UK and open in a new tab. eBay asks you to sign in before it shows sold
        prices, so sign in once on this device and every lookup after that goes straight through.
      </p>
    </div>
  )
}
