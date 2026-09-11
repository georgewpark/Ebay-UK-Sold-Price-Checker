/**
 * Recent scans used to show the time alone, so yesterday's 14:32 and today's
 * were indistinguishable. Anything older than today gets a date instead.
 */

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const thisYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const otherYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const full = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short' })

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

/** Short enough for the end of a row. */
export function formatScanTime(at: number, now: number = Date.now()): string {
  const then = new Date(at)
  const today = startOfDay(new Date(now))
  const day = startOfDay(then)

  if (day === today) return clock.format(then)
  if (day === today - 86_400_000) return 'Yesterday'
  return then.getFullYear() === new Date(now).getFullYear()
    ? thisYear.format(then)
    : otherYear.format(then)
}

/** The unabbreviated version, for the tooltip and the accessible name. */
export function describeScanTime(at: number): string {
  return full.format(new Date(at))
}

/** For the datetime attribute, which wants a machine-readable value. */
export function isoScanTime(at: number): string {
  return new Date(at).toISOString()
}
