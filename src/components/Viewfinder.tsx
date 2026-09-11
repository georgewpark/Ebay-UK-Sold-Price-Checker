import { memo } from 'react'
import type { RefObject } from 'react'
import type { Notice, ScannerStatus } from '../hooks/useScanner.ts'
import { RETICLE } from '../lib/frame.ts'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  status: ScannerStatus
  notice: Notice | null
  flashKey: number
  torch: { available: boolean; on: boolean; toggle: () => void }
  onToggleScan: () => void
}

/** Drawn from the same numbers the decoder crops to, so the box tells the truth. */
const RETICLE_INSET = `${RETICLE.y * 100}% ${RETICLE.x * 100}%`

function Viewfinder({ videoRef, status, notice, flashKey, torch, onToggleScan }: Props) {
  const scanning = status === 'scanning'
  const alert = notice?.tone === 'error' ? notice : null
  const update = notice?.tone === 'error' ? null : notice

  return (
    <section
      aria-label="Barcode scanner"
      className="relative aspect-4/3 w-full overflow-hidden rounded-card bg-lens ring-1 ring-line"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="h-full w-full object-cover"
        aria-label="Camera viewfinder"
      />

      {scanning && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ inset: RETICLE_INSET }}
        >
          <Corner className="left-0 top-0 border-l-3 border-t-3 rounded-tl-md" />
          <Corner className="right-0 top-0 border-r-3 border-t-3 rounded-tr-md" />
          <Corner className="bottom-0 left-0 border-b-3 border-l-3 rounded-bl-md" />
          <Corner className="bottom-0 right-0 border-b-3 border-r-3 rounded-br-md" />
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-accent/70 shadow-[0_0_12px_var(--color-accent)]" />
        </div>
      )}

      {flashKey > 0 && (
        <div
          key={flashKey}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-[flash_360ms_ease-out_forwards] bg-accent"
        />
      )}

      {/* Two regions, both always mounted. "Camera blocked" should interrupt;
          "Starting the camera" should not. Swapping the role on one node is not
          reliably picked up, so each tone gets its own. */}
      <div role="status" aria-live="polite">
        {update && <Overlay notice={update} />}
      </div>
      <div role="alert">{alert && <Overlay notice={alert} />}</div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-4">
        <button
          type="button"
          onClick={onToggleScan}
          disabled={status === 'starting'}
          className="rounded-full bg-white/95 px-5 py-2.5 text-sm font-semibold text-[#111113] shadow-lg backdrop-blur transition focus-visible:outline-[#111113] focus-visible:outline-offset-0 active:scale-[0.98] disabled:opacity-60"
        >
          {status === 'starting' ? 'Starting' : scanning ? 'Stop' : 'Start scanning'}
        </button>

        {torch.available && (
          <button
            type="button"
            onClick={torch.toggle}
            aria-pressed={torch.on}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg backdrop-blur transition focus-visible:outline-offset-0 ${
              torch.on
                ? 'bg-accent text-accent-ink focus-visible:outline-[#171a0c]'
                : 'bg-[#1b1b1f] text-white ring-1 ring-white/70 focus-visible:outline-white'
            }`}
          >
            {torch.on ? 'Torch on' : 'Torch off'}
          </button>
        )}
      </div>
    </section>
  )
}

function Overlay({ notice }: { notice: Notice }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-lens/70 px-8 text-center backdrop-blur-[1px]">
      <p className="text-base font-semibold text-white">{notice.title}</p>
      <p className="max-w-xs text-[13px] leading-relaxed text-white/70">{notice.body}</p>
    </div>
  )
}

function Corner({ className }: { className: string }) {
  return <div className={`absolute h-7 w-7 border-accent ${className}`} />
}

export default memo(Viewfinder)
