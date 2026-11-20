/**
 * Imported first in main.ts: unpacks data carried over from the laptop's previous address
 * before the store reads localStorage. See move.ts.
 */
import { acceptMove } from './move'

/** The previous address this tablet just moved from, or null. */
export const movedFrom = acceptMove()
