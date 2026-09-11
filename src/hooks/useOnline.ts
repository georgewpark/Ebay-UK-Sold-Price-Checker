import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const getSnapshot = () => navigator.onLine
/** Nothing server-renders this app, but the third argument is not optional. */
const getServerSnapshot = () => true

/**
 * navigator.onLine is only trustworthy when it says false: a laptop on a
 * captive-portal wifi still reports true. False is the case we care about,
 * because every search on this page opens eBay, and eBay needs a connection.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
