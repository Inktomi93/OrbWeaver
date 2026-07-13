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
import type { AutoModeResult, AutoModeStopReason, CastName } from "../contract/arbitration";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors";
import type { TurnOutcome } from "../contract/results";

interface AutoModeParams {
  readonly maxTurns: number;
  readonly delayMs: number;
  /** Sleep, injected (tests pass a no-op; prod a real timer). */
  readonly delay: (ms: number) => Promise<void>;
  readonly signal?: AbortSignal | undefined;
  /** Resolve the next single speaker given the previous one. `null` ⇒ no eligible speaker → stop. */
  readonly nextSpeaker: (lastSpeaker: SpeakerRef | null) => Promise<CastName | null>;
  readonly runTurn: (speaker: CastName) => Promise<TurnOutcome>;
  /** The speaker immediately before the chain (ban-last seed); null at chain start. */
  readonly initialLastSpeaker?: SpeakerRef | null | undefined;
}

/** A per-chat lock refusal — a concurrent turn holds the lock. */
function isLockedRefusal(err: unknown): boolean {
  return err instanceof ChatOperationError && err.code === CHAT_OP_CODES.locked;
}

/** One chained turn: arbitrate → run. Non-lock turn errors propagate. */
type StepResult =
  | { readonly done: AutoModeStopReason }
  | { readonly committed: readonly MessageView[]; readonly speakerRef: SpeakerRef };

async function step(params: AutoModeParams, last: SpeakerRef | null): Promise<StepResult> {
  const speaker = await params.nextSpeaker(last);
  if (speaker === null) {
    return { done: "no-eligible" };
  }
  try {
    const outcome = await params.runTurn(speaker);
    return { committed: outcome.messages, speakerRef: speaker.ref };
  } catch (err) {
    if (isLockedRefusal(err)) {
      return { done: "locked" };
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
    // biome-ignore lint/performance/noAwaitInLoops: the chain is sequential — each turn re-arbitrates off the prior turn's committed canon; parallelism would defeat it.
    const r = await step(params, last);
    if ("done" in r) {
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
