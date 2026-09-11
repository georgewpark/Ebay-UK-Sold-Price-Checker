import { describe, expect, it } from 'vitest'
import { formatScanTime } from './time.ts'

/** Fixed reference point: 14:30 on Thursday 11 September 2025. */
const NOW = new Date(2025, 8, 11, 14, 30).getTime()
const HOUR = 3_600_000
const DAY = 86_400_000

describe('formatScanTime', () => {
  it('shows the clock time for today', () => {
    expect(formatScanTime(NOW - 2 * HOUR, NOW)).toBe('12:30')
  })

  it('still shows a clock time just after midnight', () => {
    const justAfterMidnight = new Date(2025, 8, 11, 0, 5).getTime()
    expect(formatScanTime(justAfterMidnight, NOW)).toBe('00:05')
  })

  /** The bug: 14:32 yesterday and 14:32 today used to read identically. */
  it('names yesterday rather than repeating a clock time', () => {
    expect(formatScanTime(NOW - DAY, NOW)).toBe('Yesterday')
  })

  it('counts yesterday by the calendar, not by 24 hours', () => {
    // 23:50 the previous night is 14h 40m ago, but it is still yesterday.
    const lateLastNight = new Date(2025, 8, 10, 23, 50).getTime()
    expect(formatScanTime(lateLastNight, NOW)).toBe('Yesterday')
  })

  it('dates anything older in the same year', () => {
    expect(formatScanTime(new Date(2025, 7, 3, 9, 0).getTime(), NOW)).toBe('3 Aug')
  })

  it('adds the year once it is a different one', () => {
    expect(formatScanTime(new Date(2024, 11, 30, 9, 0).getTime(), NOW)).toBe('30 Dec 2024')
  })
})
