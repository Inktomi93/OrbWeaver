import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { Cancellation } from "@orb/kit/guards";

/** Is `signal` aborted right now? Read through a call so a check after an `await` sees the live value: TypeScript
 *  narrows `signal.aborted` to `false` after an earlier `if (signal.aborted)` exit and keeps that narrowing across
 *  awaits, so an inline re-read in a `catch` reads as dead code while the signal can have fired meanwhile. */
export function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** `map` over `items` one event-loop turn apart, so a long list never holds the loop. Once `signal` aborts it stops
 *  before the next item and returns the results so far, which the aborted caller discards. */
export async function mapYielding<Item, Result>(items: readonly Item[], signal: Cancellation, map: (item: Item) => Result): Promise<Result[]> {
  const results: Result[] = [];
  for (const item of items) {
    if (signal.aborted) {
      break;
    }
    results.push(map(item));
    await yieldToEventLoop();
  }
  return results;
}
