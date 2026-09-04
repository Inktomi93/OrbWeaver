// domain/chat/engine/auto-mode — the AI→AI chaining loop. Re-arbitrates per turn (a fresh `nextSpeaker`
// each iteration sees newly-committed canon + presence), runs one turn, repeats until a stop condition.
// Deterministic: the clock + inter-turn delay are injected; the cap is explicit.
//
// Stop conditions: `max-turns` (the cap), `interrupt` (the caller's AbortSignal fired), `no-eligible`
// (arbitration produced no speaker), `locked` (a concurrent turn — human send interleaved — holds the lock).
//
// Every chained turn is `triggeredBy` the chain-starter, not a fresh caller — the caller wires that into the
// `runTurn` callback's TurnPrep. ban-last/allowSelfResponses live inside the injected `nextSpeaker`, so this
// loop is policy-free orchestration.

import type { MessageView, SpeakerRef } from "@orb/contracts/chat";
import type { AutoModeResult, AutoModeStopReason, SpeakerCandidate } from "../contract/arbitration.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { TurnOutcome } from "../contract/results.ts";

interface AutoModeParams {
  readonly maxTurns: number;
  readonly delayMs: number;
  /** Sleep, injected (tests pass a no-op; prod a real timer). */
  readonly delay: (ms: number) => Promise<void>;
  readonly signal?: AbortSignal | undefined;
  /** Resolve the next single speaker given the previous one. `null` ⇒ no eligible speaker → stop. */
  readonly nextSpeaker: (lastSpeaker: SpeakerRef | null) => Promise<SpeakerCandidate | null>;
  readonly runTurn: (speaker: SpeakerCandidate) => Promise<TurnOutcome>;
  /** The speaker immediately before the chain (ban-last seed); null at chain start. */
  readonly initialLastSpeaker?: SpeakerRef | null | undefined;
}

/** A per-chat lock refusal — a concurrent turn holds the lock. */
function isLockedRefusal(err: unknown): boolean {
  return err instanceof ChatOperationError && err.code === CHAT_OP_CODES.locked;
}

/** One chained turn: arbitrate → run. Non-lock turn errors propagate. A `done` arm still carries whatever the
 *  step committed before it stopped — an ABORTED round returns its partial rows through the normal result
 *  channel (`driveRound`'s `{messages, aborted}`), and those rows are canon whether or not the chain goes on. */
type StepResult =
  | { readonly done: AutoModeStopReason; readonly committed: readonly MessageView[] }
  | { readonly committed: readonly MessageView[]; readonly speakerRef: SpeakerRef };

async function step(params: AutoModeParams, last: SpeakerRef | null): Promise<StepResult> {
  const speaker = await params.nextSpeaker(last);
  if (speaker === null) {
    // `nextSpeaker` is now CANCELLABLE (the `smart` side-LLM arbitration reads this same signal), and a
    // cancelled arbitration yields no speaker. A settled signal means the caller interrupted — report that,
    // not the "everyone is muted/left" story `no-eligible` tells.
    return { done: params.signal?.aborted === true ? "interrupt" : "no-eligible", committed: [] };
  }
  try {
    const outcome = await params.runTurn(speaker);
    if (outcome.aborted) {
      // AN ABORT IS A STOP CONDITION (#1453). `TurnOutcome` carries abortion as RESULT state, not a throw
      // (`engine/result.ts` — the owner-ruled return-based shape), and the engine's OWN abort paths (a caller
      // Stop that raced this turn, the heartbeat's stale-lock kill) never touch the chain's outer signal. So
      // reading only `outcome.messages` fed a dead turn forward as if it had committed: the last speaker
      // advanced, the turn count grew, and the chain arbitrated and GENERATED the next speaker on top of a
      // turn the user had just cancelled. Keep the rows that genuinely landed; stop the chain.
      return { done: "interrupt", committed: outcome.messages };
    }
    return { committed: outcome.messages, speakerRef: speaker.ref };
  } catch (err) {
    if (isLockedRefusal(err)) {
      return { done: "locked", committed: [] };
    }
    throw err;
  }
}

/** Run the auto-mode AI→AI chain. Returns how many turns ran, why it stopped, and the committed messages. */
export async function runAutoMode(params: AutoModeParams): Promise<AutoModeResult> {
  const messages: MessageView[] = [];
  let last: SpeakerRef | null = params.initialLastSpeaker ?? null;
  let turns = 0;
  const stop = (stopReason: AutoModeStopReason): AutoModeResult => ({
    turns,
    stopReason,
    messages,
  });
  const aborted = (): boolean => params.signal?.aborted === true;

  while (turns < params.maxTurns) {
    if (aborted()) {
      return stop("interrupt");
    }
    const r = await step(params, last);
    if ("done" in r) {
      // The rows a stopping step committed are canon and belong in the chain's report — the caller renders
      // `messages`, so dropping them here would hide a landed reply behind the stop reason. `turns` is NOT
      // incremented: the turn did not complete.
      messages.push(...r.committed);
      return stop(r.done);
    }
    messages.push(...r.committed);
    last = r.speakerRef;
    turns += 1;
    if (turns >= params.maxTurns) {
      break; // cap reached — exit before any trailing delay.
    }
    if (aborted()) {
      return stop("interrupt");
    }
    if (params.delayMs > 0) {
      await params.delay(params.delayMs);
    }
  }
  return stop("max-turns");
}
