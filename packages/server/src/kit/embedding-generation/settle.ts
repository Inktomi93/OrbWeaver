// The one settle loop every sweep that re-derives an embed scope runs, because a move of the owner's embedding target
// can land mid-sweep: the switch purges what the sweep wrote and refuses its terminal, so only a round no move raced
// has re-derived the scope.

import { isAborted } from "#kit/abort";

/** A sweep's owner moved to a new target generation while the sweep ran: what it already wrote went with the old
 *  index. Not a failure of the run: {@link runUntilSettled} runs the round again on the new target. */
export class GenerationSupersededError extends Error {
  readonly ownerId: string;
  constructor(ownerId: string, scope: "card" | "image" | "memory") {
    super(`embedding generation changed during ${scope} sweep for owner ${ownerId}`);
    this.name = "GenerationSupersededError";
    this.ownerId = ownerId;
  }
}

/** One settling sweep. */
export interface SettleRun<R> {
  /** Every stored target in the sweep's scope as one comparable string; any move changes it. */
  readonly snapshot: () => Promise<string>;
  readonly signal: AbortSignal;
  /** One whole round of the sweep, its terminal included. `first` is false on every repeat. */
  readonly round: (first: boolean) => Promise<R>;
}

type RoundOutcome<R> = { readonly done: true; readonly result: R } | { readonly done: false; readonly error: GenerationSupersededError };

async function attempt<R>(run: SettleRun<R>, first: boolean): Promise<RoundOutcome<R>> {
  try {
    return { done: true, result: await run.round(first) };
  } catch (error) {
    if (!(error instanceof GenerationSupersededError) || isAborted(run.signal)) {
      throw error;
    }
    return { done: false, error };
  }
}

/**
 * Rounds until one finishes with no target in scope moved since it began.
 *
 * @remarks A round that reports {@link GenerationSupersededError} goes again only when the snapshot really moved;
 * with no move behind it the mismatch is a fault, rethrown so the loop cannot spin. An aborted round ends the run
 * with no extra round.
 */
export async function runUntilSettled<R>(run: SettleRun<R>): Promise<R> {
  for (let first = true; ; first = false) {
    const pinned = await run.snapshot();
    const round = await attempt(run, first);
    if (round.done && isAborted(run.signal)) {
      return round.result;
    }
    if ((await run.snapshot()) === pinned) {
      if (!round.done) {
        throw round.error;
      }
      return round.result;
    }
  }
}
