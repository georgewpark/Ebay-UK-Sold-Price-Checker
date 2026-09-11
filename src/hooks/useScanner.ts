import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDetector } from '../lib/detector.ts'
import { createFrameGrabber } from '../lib/frame.ts'

export type ScannerStatus = 'idle' | 'starting' | 'scanning'

export interface Notice {
  title: string
  body: string
}

const IDLE_NOTICE: Notice = {
  title: 'Camera off',
  body: 'Start the scanner to look up a barcode.',
}

const HIDDEN_NOTICE: Notice = {
  title: 'Camera released',
  body: 'We switched the camera off when you left the page. Start it again to scan.',
}

/** Gap between decode attempts. Detection itself is awaited, so this is a floor. */
const FRAME_INTERVAL = 140

interface TorchConstraint {
  torch: boolean
}

export function useScanner(onDetect: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runningRef = useRef(false)
  const startingRef = useRef(false)
  const onDetectRef = useRef(onDetect)

  // Mutating a ref during render is not safe under concurrent rendering, and a
  // scan cannot begin before commit anyway, so keep the sync in an effect.
  useEffect(() => {
    onDetectRef.current = onDetect
  })

  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [notice, setNotice] = useState<Notice | null>(IDLE_NOTICE)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setTorchAvailable(false)
    setTorchOn(false)
  }, [])

  const stop = useCallback(
    (message: Notice = IDLE_NOTICE) => {
      runningRef.current = false
      startingRef.current = false
      releaseCamera()
      setStatus('idle')
      setNotice(message)
    },
    [releaseCamera],
  )

  // Guarding on refs rather than `status` keeps this callback stable, so the
  // whole hook result can stay referentially stable between renders.
  const start = useCallback(async () => {
    if (runningRef.current || startingRef.current) return
    startingRef.current = true
    setStatus('starting')
    setNotice(null)

    let detector
    try {
      detector = await getDetector()
    } catch {
      stop({
        title: 'Scanner unavailable',
        body: 'The barcode reader did not load. Check your connection, or type a product name instead.',
      })
      return
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        // 720p starts faster than 1080p and, once cropped to the reticle, still
        // carries far more detail than the decoder needs.
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
    } catch {
      const secure = window.isSecureContext
      stop({
        title: secure ? 'Camera blocked' : 'Needs HTTPS',
        body: secure
          ? 'Allow camera access for this site in your browser settings, then try again.'
          : 'Browsers only share a camera over HTTPS. Open this page on a secure address and reload.',
      })
      return
    }

    const video = videoRef.current
    if (!video) {
      stop()
      return
    }
    video.srcObject = streamRef.current
    await video.play().catch(() => {})

    const track = streamRef.current.getVideoTracks()[0]
    try {
      setTorchAvailable(Boolean(track?.getCapabilities?.() && 'torch' in track.getCapabilities()))
    } catch {
      setTorchAvailable(false)
    }

    runningRef.current = true
    startingRef.current = false
    setStatus('scanning')

    const grabber = createFrameGrabber()

    while (runningRef.current) {
      if (video.readyState >= 2 && !document.hidden) {
        const frame = grabber.grab(video)
        if (frame) {
          try {
            const hits = await detector.detect(frame)
            const value = hits[0]?.rawValue.trim()
            if (value) {
              stop({ title: 'Scanned', body: 'Start the scanner again for the next item.' })
              grabber.release()
              onDetectRef.current(value)
              return
            }
          } catch {
            /* a dropped frame is not worth surfacing */
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL))
    }
    grabber.release()
  }, [stop])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet & TorchConstraint],
      })
      setTorchOn((on) => !on)
    } catch {
      setTorchAvailable(false)
    }
  }, [torchOn])

  // Holding a camera open behind a hidden tab costs battery and keeps the
  // indicator light on for no reason.
  useEffect(() => {
    const release = () => {
      if (document.hidden && (runningRef.current || startingRef.current)) stop(HIDDEN_NOTICE)
    }
    document.addEventListener('visibilitychange', release)
    return () => document.removeEventListener('visibilitychange', release)
  }, [stop])

  // Never leave the camera running behind us.
  useEffect(() => {
    return () => {
      runningRef.current = false
      startingRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const torch = useMemo(
    () => ({ available: torchAvailable, on: torchOn, toggle: toggleTorch }),
    [torchAvailable, torchOn, toggleTorch],
  )

  return useMemo(
    () => ({ videoRef, status, notice, start, stop, torch }),
    [status, notice, start, stop, torch],
  )
}
