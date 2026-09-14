import { describe, expect, it } from 'vitest'
import { createDuplicateGate } from './duplicates.ts'

const GAP = 5000

describe('createDuplicateGate', () => {
  it('accepts a code the first time it is seen', () => {
    const gate = createDuplicateGate(GAP)
    expect(gate.accepts('A', 0)).toBe(true)
  })

  it('holds the same code back while it is still in view', () => {
    const gate = createDuplicateGate(GAP)
    gate.accepts('A', 0)

    expect(gate.accepts('A', 100)).toBe(false)
    expect(gate.accepts('A', 4999)).toBe(false)
  })

  /**
   * The gap runs from the last sighting, not from the last accepted read. A
   * barcode left in front of the lens is read ten times a second, so a gap that
   * ran from the acceptance would fire again every five seconds for as long as
   * the user held the camera still.
   */
  it('does not fire again for a code that never left the lens', () => {
    const gate = createDuplicateGate(GAP)
    gate.accepts('A', 0)

    for (let now = 100; now <= 30_000; now += 100) {
      expect(gate.accepts('A', now)).toBe(false)
    }
  })

  it('accepts a code again once it has been away for the whole gap', () => {
    const gate = createDuplicateGate(GAP)
    gate.accepts('A', 0)

    expect(gate.accepts('A', GAP)).toBe(true)
  })

  /**
   * The regression this exists for. A single slot holding the code read last
   * only ever caught an immediate repeat, so two barcodes inside the reticle
   * defeated it completely: A, B, A, B means neither is ever the code read
   * last. Every frame fired a detect, which downstream is a lookup, a history
   * write and a flash of most of the screen, ten times a second.
   */
  it('holds back two codes read alternately, not just an immediate repeat', () => {
    const gate = createDuplicateGate(GAP)
    expect(gate.accepts('A', 0)).toBe(true)
    expect(gate.accepts('B', 100)).toBe(true)

    for (let now = 200; now < GAP; now += 100) {
      expect(gate.accepts(now % 200 === 0 ? 'A' : 'B', now)).toBe(false)
    }
  })

  it('keeps a separate gap for each code', () => {
    const gate = createDuplicateGate(GAP)
    gate.accepts('A', 0)
    gate.accepts('B', 3000)

    // A has been gone the whole gap. B has not.
    expect(gate.accepts('A', 5000)).toBe(true)
    expect(gate.accepts('B', 5000)).toBe(false)
  })

  /** Continuous mode runs over a lot of stock, so a long run must not leave the
      gate treating everything it has ever seen as a duplicate. */
  it('treats a code from earlier in a long run as new again', () => {
    const gate = createDuplicateGate(GAP)
    for (let i = 0; i < 1000; i++) gate.accepts(`code-${i}`, i)

    expect(gate.accepts('code-0', 100_000)).toBe(true)
    expect(gate.accepts('code-999', 100_000)).toBe(true)
  })
})
