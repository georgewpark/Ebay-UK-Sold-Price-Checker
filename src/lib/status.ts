import type { LookupResult } from './lookup.ts'
import type { ScanStatus } from './types.ts'

/**
 * The caption under the barcode, and what a screen reader hears.
 *
 * Screen readers run digits together, so the spoken copy spells the barcode out.
 * Keeping the two strings side by side here means neither drifts from the other,
 * and it makes the wording testable without rendering anything.
 */

export function spell(code: string): string {
  return code.split('').join(' ')
}

export const NO_STATUS: ScanStatus = { caption: '', spoken: '' }

export function scanned(code: string): ScanStatus {
  return {
    caption: 'Looking up a product name',
    spoken: `Barcode ${spell(code)} scanned. Looking up a product name.`,
  }
}

export function recalled(label: string): ScanStatus {
  return {
    caption: 'From your recent scans.',
    spoken: `${label}, from your recent scans.`,
  }
}

/**
 * A miss and a refusal are not the same thing. "No name found" sends people off
 * to type the name themselves; "the database is busy" tells them to try again.
 */
export function describeLookup(result: LookupResult, code: string): ScanStatus {
  if (result.name) {
    return {
      caption: 'Name from a public barcode database. Edit it if it is wrong.',
      spoken: `Found ${result.name}. Name from a public barcode database. Edit it if it is wrong.`,
    }
  }

  const fallback = `We will search barcode ${spell(code)} instead.`

  switch (result.outcome) {
    case 'offline':
      return {
        caption: 'You are offline, so we could not look up a name. Searching the barcode number.',
        spoken: `You are offline, so we could not look up a name. ${fallback}`,
      }
    case 'limited':
      return {
        caption: 'The name database is busy. Try again shortly, or search the number now.',
        spoken: `The name database is busy and turned us away. ${fallback}`,
      }
    case 'unavailable':
      return {
        caption: 'We could not reach the name database. Searching the barcode number.',
        spoken: `We could not reach the name database. ${fallback}`,
      }
    default:
      return {
        caption: 'No name found, so we will search the barcode number instead.',
        spoken: `No name found for barcode ${spell(code)}. We will search the number instead.`,
      }
  }
}
