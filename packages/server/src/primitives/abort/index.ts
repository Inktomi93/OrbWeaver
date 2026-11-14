import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { Cancellation } from "@orb/kit/guards";

/** Is `signal` aborted right now? Read through a call so a check after an `await` sees the live value: TypeScript
 *  narrows `signal.aborted` to `false` after an earlier `if (signal.aborted)` exit and keeps that narrowing across
 *  awaits, so an inline re-read in a `catch` reads as dead code while the signal can have fired meanwhile. */
export function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** The cancellation of a call nothing can stop: a single-file door's batch of one. */
export const NEVER_ABORTED: Cancellation = { aborted: false };

/** The one result of a batch of one run under {@link NEVER_ABORTED}, which yields one result per item. */
export function soleResult<Result>(results: readonly Result[]): Result {
  const [only] = results;
  if (only === undefined || results.length !== 1) {
    throw new Error(`a batch of one returned ${String(results.length)} results`);
  }
  return only;
}

/** Let every other task queued on the event loop run before the caller's next synchronous stretch. */
export async function yieldToLoop(): Promise<void> {
  await yieldToEventLoop();
}

/** `map` over `items` in order, one at a time and one event-loop turn apart, so a long list never holds the loop. Once
 *  `signal` aborts it stops before the next item and returns the results so far. */
export async function mapYielding<Item, Result>(
  items: readonly Item[],
  signal: Cancellation,
  map: (item: Item) => Result | PromiseLike<Result>,
): Promise<Result[]> {
  const results: Result[] = [];
  for (const item of items) {
    if (signal.aborted) {
      break;
    }
    results.push(await map(item));
    await yieldToEventLoop();
  }
  return results;
}
