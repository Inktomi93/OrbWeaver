/** Is `signal` aborted right now? Read through a call so a check after an `await` sees the live value: TypeScript
 *  narrows `signal.aborted` to `false` after an earlier `if (signal.aborted)` exit and keeps that narrowing across
 *  awaits, so an inline re-read in a `catch` reads as dead code while the signal can have fired meanwhile. */
export function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}
