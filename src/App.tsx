import { useCallback, useRef, useState } from 'react'
import Masthead from './components/Masthead.tsx'
import Viewfinder from './components/Viewfinder.tsx'
import SearchPanel from './components/SearchPanel.tsx'
import History from './components/History.tsx'
import { useHistory } from './hooks/useHistory.ts'
import { useScanner } from './hooks/useScanner.ts'
import { ebayUrl, openTab } from './lib/ebay.ts'
import { lookupName } from './lib/lookup.ts'
import type { ScanEntry } from './lib/types.ts'

export default function App() {
  const [code, setCode] = useState('')
  const [term, setTerm] = useState('')
  const [provenance, setProvenance] = useState('')
  const [flashKey, setFlashKey] = useState(0)

  const { entries, record, clear } = useHistory()
  const lookupId = useRef(0)

  const handleDetect = useCallback(
    (scanned: string) => {
      setFlashKey((key) => key + 1)
      navigator.vibrate?.(45)

      setCode(scanned)
      setTerm(scanned)
      setProvenance('Looking up a product name')

      const id = ++lookupId.current
      void lookupName(scanned).then((name) => {
        if (id !== lookupId.current) return
        if (name) {
          setTerm(name)
          setProvenance('Name from a public barcode database. Edit it if it is wrong.')
          record(scanned, name)
        } else {
          setProvenance('No name found, so we will search the barcode number instead.')
          record(scanned, scanned)
        }
      })
    },
    [record],
  )

  const scanner = useScanner(handleDetect)

  const search = useCallback(
    (sold: boolean) => {
      const query = term.trim()
      if (!query) return
      if (sold) record(code || query, query)
      openTab(ebayUrl(query, sold))
    },
    [code, record, term],
  )

  const recall = useCallback((entry: ScanEntry) => {
    setCode(entry.code)
    setTerm(entry.label)
    setProvenance('From your recent scans.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

      <main className="flex flex-col gap-3">
        <Viewfinder
          videoRef={scanner.videoRef}
          status={scanner.status}
          notice={scanner.notice}
          flashKey={flashKey}
          torch={scanner.torch}
          onToggleScan={toggleScan}
        />

        <SearchPanel
          code={code}
          provenance={provenance}
          term={term}
          onTermChange={setTerm}
          onSold={() => search(true)}
          onLive={() => search(false)}
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
