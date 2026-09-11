import { useCallback, useEffect, useRef, useState } from 'react'
import { getDetector } from '../lib/detector.ts'

export type ScannerStatus = 'idle' | 'starting' | 'scanning'

export interface Notice {
  title: string
  body: string
}

const IDLE_NOTICE: Notice = {
  title: 'Camera off',
  body: 'Start the scanner to look up a barcode.',
}

interface TorchConstraint {
  torch: boolean
}

export function useScanner(onDetect: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runningRef = useRef(false)
  const onDetectRef = useRef(onDetect)
  onDetectRef.current = onDetect

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
      releaseCamera()
      setStatus('idle')
      setNotice(message)
    },
    [releaseCamera],
  )

  const start = useCallback(async () => {
    if (runningRef.current || status === 'starting') return
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
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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
    setStatus('scanning')

    while (runningRef.current) {
      if (video.readyState >= 2) {
        try {
          const hits = await detector.detect(video)
          const value = hits[0]?.rawValue.trim()
          if (value) {
            stop({ title: 'Scanned', body: 'Start the scanner again for the next item.' })
            onDetectRef.current(value)
            return
          }
        } catch {
          /* a dropped frame is not worth surfacing */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 140))
    }
  }, [status, stop])

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

  // Never leave the camera running behind us.
  useEffect(() => {
    return () => {
      runningRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  return {
    videoRef,
    status,
    notice,
    start,
    stop,
    torch: { available: torchAvailable, on: torchOn, toggle: toggleTorch },
  }
}
