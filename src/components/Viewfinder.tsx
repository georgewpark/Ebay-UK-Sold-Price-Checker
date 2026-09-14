import { memo, useId, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { Notice, ScannerStatus } from '../hooks/useScanner.ts'
import { RETICLE } from '../lib/frame.ts'

interface Toggle {
  on: boolean
  toggle: () => void
}

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  status: ScannerStatus
  notice: Notice | null
  flashKey: number
  torch: Toggle & { available: boolean }
  keepScanning: Toggle
  onToggleScan: () => void
}

/** Drawn from the same numbers the decoder crops to, so the box tells the truth. */
const RETICLE_INSET = `${RETICLE.y * 100}% ${RETICLE.x * 100}%`

function Viewfinder({
  videoRef,
  status,
  notice,
  flashKey,
  torch,
  keepScanning,
  onToggleScan,
}: Props) {
  const scanning = status === 'scanning'
  const alert = notice?.tone === 'error' ? notice : null
  const update = notice?.tone === 'error' ? null : notice

  const scanRef = useRef<HTMLButtonElement>(null)
  const hadTorch = useRef(torch.available)

  /**
   * The torch pill only exists while the camera does, so every stop unmounts
   * it, including the stop a successful scan triggers. Browsers blur an element
   * the moment it leaves the document, which leaves a keyboard or screen reader
   * user at <body> with the whole page to tab through again, mid-task. Hand
   * focus to the scan button instead, the way History rescues it from a removed
   * row, and do it before the browser paints.
   */
  useLayoutEffect(() => {
    const lost = hadTorch.current && !torch.available
    hadTorch.current = torch.available
    if (!lost) return

    // Only claim focus the browser actually dropped. Anywhere else and the user
    // has moved on, and dragging them back to the scanner would be worse than
    // the problem we are fixing.
    const active = document.activeElement
    if (!active || active === document.body) scanRef.current?.focus({ preventScroll: true })
  }, [torch.available])

  return (
    <section
      aria-label="Barcode scanner"
      className="relative aspect-4/3 w-full overflow-hidden rounded-card bg-lens ring-1 ring-line"
    >
      {/* The feed carries nothing a screen reader can use, and the notice and
          caption below already report what the scanner is doing. Labelling it
          only adds an unlabelled-looking generic to the tree. */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className="h-full w-full object-cover"
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

      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-4">
        {/* aria-disabled rather than disabled. Browsers blur an element at the
            moment it becomes disabled, so pressing this with a keyboard used to
            drop focus to <body> just as the permission prompt opened. Starting
            is a no-op instead, the way SearchPanel handles its blocked buttons. */}
        <button
          ref={scanRef}
          type="button"
          onClick={() => {
            if (status !== 'starting') onToggleScan()
          }}
          aria-disabled={status === 'starting'}
          className="rounded-full bg-white/95 px-5 py-2.5 text-sm font-semibold text-[#111113] shadow-lg backdrop-blur transition focus-visible:outline-[#111113] focus-visible:outline-offset-0 active:scale-[0.98] aria-disabled:opacity-60"
        >
          {status === 'starting' ? 'Starting' : scanning ? 'Stop' : 'Start scanning'}
        </button>

        {/* A fixed label plus aria-pressed. The label used to change with the
            state as well, so a screen reader announced "Torch on, pressed",
            which leaves you guessing which half is the current state. */}
        {torch.available && <PillToggle label="Torch" pressed={torch.on} onToggle={torch.toggle} />}

        <PillToggle
          label="Keep scanning"
          pressed={keepScanning.on}
          onToggle={keepScanning.toggle}
          hint="Stay on the camera and read one item after another"
        />
      </div>
    </section>
  )
}

function Overlay({ notice }: { notice: Notice }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-lens/70 px-8 text-center backdrop-blur-[1px]">
      <p className="text-base font-semibold text-white">{notice.title}</p>
      <p className="max-w-xs text-[0.8125rem] leading-relaxed text-white/70">{notice.body}</p>
    </div>
  )
}

function PillToggle({
  label,
  pressed,
  onToggle,
  hint,
}: {
  label: string
  pressed: boolean
  onToggle: () => void
  hint?: string
}) {
  const hintId = useId()

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={pressed}
        /* The tooltip is still worth having for a mouse, but it used to be the
           only route to the hint: title never appears on touch, cannot be
           reached by keyboard, and screen reader support for it is patchy. */
        title={hint}
        aria-describedby={hint ? hintId : undefined}
        className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg backdrop-blur transition focus-visible:outline-offset-0 ${
          pressed
            ? 'bg-accent text-accent-ink focus-visible:outline-[#171a0c]'
            : 'bg-[#1b1b1f] text-white ring-1 ring-white/70 focus-visible:outline-white'
        }`}
      >
        {/* Colour alone must not carry the state (WCAG 1.4.1), so the on state
            also gets a mark. It is decorative: aria-pressed is the real signal. */}
        <span aria-hidden="true" className="w-3 text-center leading-none">
          {pressed ? '✓' : '·'}
        </span>
        {label}
      </button>

      {/* Outside the button on purpose. Inside, it would join the accessible
          name as well as the description, and be read twice. sr-only is
          absolutely positioned, so it takes no room in the button row. */}
      {hint && (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      )}
    </>
  )
}

function Corner({ className }: { className: string }) {
  return <div className={`absolute h-7 w-7 border-accent ${className}`} />
}

export default memo(Viewfinder)
