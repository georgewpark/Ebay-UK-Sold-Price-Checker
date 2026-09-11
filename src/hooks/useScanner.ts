import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NO_BARCODE, openDecoder } from '../lib/decoder.ts'
import { closeFrame, createFrameGrabber } from '../lib/frame.ts'

export type ScannerStatus = 'idle' | 'starting' | 'scanning'

export interface Notice {
  title: string
  body: string
  /** Errors are announced assertively; everything else waits its turn. */
  tone: 'info' | 'error'
}

const IDLE_NOTICE: Notice = {
  title: 'Camera off',
  body: 'Start the scanner to look up a barcode.',
  tone: 'info',
}

const STARTING_NOTICE: Notice = {
  title: 'Starting the camera',
  body: 'Allow camera access if your browser asks.',
  tone: 'info',
}

const SCANNED_NOTICE: Notice = {
  title: 'Scanned',
  body: 'Start the scanner again for the next item.',
  tone: 'info',
}

const HIDDEN_NOTICE: Notice = {
  title: 'Camera released',
  body: 'We switched the camera off when you left the page. Start it again to scan.',
  tone: 'info',
}

/** Floor between decode attempts. The decoder runs off-thread, so this is about
    not burning battery on frames the camera has not replaced yet. */
const FRAME_INTERVAL = 100

/** If the video stalls, stop waiting on it and re-check whether we should run. */
const STALL_TIMEOUT = 1000

/** In continuous mode, ignore the same barcode read again this soon. */
const DUPLICATE_GAP = 5000

/** Consecutive frames the decoder could not read before we blame the capture. */
const CAPTURE_FAILURE_LIMIT = 3

interface TorchConstraint {
  torch: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Resolve on the next frame the camera actually delivers, rather than on a
 * fixed timer that happily decodes the same frame twice. Falls back to the
 * timer where requestVideoFrameCallback is missing, and gives up after a stall
 * so a frozen stream cannot strand the loop.
 */
function nextFrame(video: HTMLVideoElement): Promise<void> {
  const request = video.requestVideoFrameCallback?.bind(video)
  if (!request) return sleep(FRAME_INTERVAL)

  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    const handle = request(finish)
    setTimeout(() => {
      if (done) return
      video.cancelVideoFrameCallback?.(handle)
      finish()
    }, STALL_TIMEOUT)
  })
}

export function useScanner(onDetect: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runningRef = useRef(false)
  const startingRef = useRef(false)
  const onDetectRef = useRef(onDetect)

  /**
   * Bumped by every start and every stop. Starting awaits three times before
   * the camera is live, and a visibility change during any of those awaits used
   * to leave a stream running behind a hidden tab: stop released a stream that
   * had not been assigned yet, then getUserMedia resolved and started one.
   * Comparing the generation after each await closes that window.
   */
  const generation = useRef(0)

  // Mutating a ref during render is not safe under concurrent rendering, and a
  // scan cannot begin before commit anyway, so keep the sync in an effect.
  useEffect(() => {
    onDetectRef.current = onDetect
  })

  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [notice, setNotice] = useState<Notice | null>(IDLE_NOTICE)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [continuous, setContinuous] = useState(false)

  const continuousRef = useRef(continuous)
  useEffect(() => {
    continuousRef.current = continuous
  })

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setTorchAvailable(false)
    setTorchOn(false)
  }, [])

  const stop = useCallback(
    (message: Notice = IDLE_NOTICE) => {
      generation.current += 1
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
    const run = (generation.current += 1)
    const current = () => generation.current === run

    startingRef.current = true
    setStatus('starting')
    setNotice(STARTING_NOTICE)

    let decoder
    try {
      decoder = await openDecoder()
    } catch {
      if (current()) {
        stop({
          title: 'Scanner unavailable',
          body: 'The barcode reader did not load. Check your connection, or type a product name instead.',
          tone: 'error',
        })
      }
      return
    }
    if (!current()) return

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
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
      if (current()) {
        const secure = window.isSecureContext
        stop({
          title: secure ? 'Camera blocked' : 'Needs HTTPS',
          body: secure
            ? 'Allow camera access for this site in your browser settings, then try again.'
            : 'Browsers only share a camera over HTTPS. Open this page on a secure address and reload.',
          tone: 'error',
        })
      }
      return
    }

    // Only adopt the stream once we know nobody asked us to stop while the
    // permission prompt was open.
    if (!current()) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    const video = videoRef.current
    if (!video) {
      stream.getTracks().forEach((track) => track.stop())
      stop()
      return
    }

    streamRef.current = stream
    video.srcObject = stream
    await video.play().catch(() => {})
    if (!current()) return

    const track = stream.getVideoTracks()[0]
    try {
      const capabilities = track?.getCapabilities?.()
      setTorchAvailable(Boolean(capabilities && 'torch' in capabilities))
    } catch {
      setTorchAvailable(false)
    }

    runningRef.current = true
    startingRef.current = false
    setStatus('scanning')
    setNotice(null)

    const grabber = createFrameGrabber()
    let lastValue = ''
    let lastAt = 0
    let failures = 0

    try {
      while (current() && runningRef.current) {
        const usable = video.readyState >= 2 && !document.hidden
        const frame = usable ? await grabber.grab(video) : null
        if (!current() || !runningRef.current) {
          closeFrame(frame)
          break
        }

        // Decode while we wait for the camera to deliver the next frame, rather
        // than before we start waiting. The wait is a floor, so this is the
        // difference between sampling every 100 ms and every 100 ms plus a
        // decode: the WASM path was the slowest to decode and so, backwards,
        // got the fewest looks at the barcode.
        const decoding = frame ? decoder.decode(frame) : Promise.resolve(NO_BARCODE)
        const [outcome] = await Promise.all([decoding, nextFrame(video), sleep(FRAME_INTERVAL)])
        if (!current()) break

        if (outcome.failed) {
          // One unreadable frame is noise. A run of them means the capture path
          // itself is wrong, and a silent scanner that never reads anything is
          // the worst way to find that out, so drop to the canvas fallback.
          if (++failures >= CAPTURE_FAILURE_LIMIT) {
            grabber.downgrade()
            failures = 0
          }
          continue
        }
        failures = 0

        const value = outcome.value
        if (!value) continue

        const now = Date.now()
        const repeat = value === lastValue && now - lastAt < DUPLICATE_GAP
        lastValue = value
        lastAt = now
        if (repeat) continue

        if (!continuousRef.current) {
          stop(SCANNED_NOTICE)
          onDetectRef.current(value)
          break
        }
        onDetectRef.current(value)
      }
    } finally {
      grabber.release()
    }
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

  const toggleContinuous = useCallback(() => setContinuous((on) => !on), [])

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
      generation.current += 1
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

  const keepScanning = useMemo(
    () => ({ on: continuous, toggle: toggleContinuous }),
    [continuous, toggleContinuous],
  )

  return useMemo(
    () => ({ videoRef, status, notice, start, stop, torch, keepScanning }),
    [status, notice, start, stop, torch, keepScanning],
  )
}
