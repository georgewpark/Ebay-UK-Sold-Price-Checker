/**
 * Which reads in continuous mode are a new item, and which are the same item
 * still sitting in front of the lens.
 *
 * This used to be one slot holding the code read last, which only ever caught
 * an immediate repeat. Two barcodes inside the reticle are read in turn, A, B,
 * A, B, so neither was ever the code read last and the pair fired a detect on
 * every frame for as long as both stayed in view. A multipack, a shelf edge, or
 * one good read alternating with a misread of the same label is enough to do
 * it. Downstream that meant a lookup and a history write per frame, and a flash
 * per frame, which is a strobe rather than a confirmation.
 *
 * Kept out of the hook so the rule can be tested without a camera.
 */
export interface DuplicateGate {
  /** True the first time a code is seen, and again once its gap has run out. */
  accepts(value: string, now: number): boolean
}

export function createDuplicateGate(gap: number): DuplicateGate {
  /** Every code still inside its gap, and when it was last seen. Stale entries
      are dropped on each read, so this holds a handful at most. */
  const recent = new Map<string, number>()

  return {
    accepts(value, now) {
      for (const [code, at] of recent) {
        if (now - at >= gap) recent.delete(code)
      }

      const repeat = recent.has(value)
      // Recorded on every sighting, not only the ones we accept, so a code held
      // in view keeps pushing its own gap back rather than firing again each
      // time the gap runs out.
      recent.set(value, now)
      return !repeat
    },
  }
}
