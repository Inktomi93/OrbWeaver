// domain/chat/engine/auto-mode — the AI→AI CHAINING loop (chat.md Part III §6 — auto-mode). Re-arbitrates
// per turn (fixing ST's "deaf round" — a fresh `nextSpeaker` each iteration sees newly-committed canon +
// presence), runs ONE turn, and repeats until a stop condition. DETERMINISTIC: the clock + the inter-turn
// delay are INJECTED (D46 — no `Date.now()`/`setTimeout` ambient); the cap is explicit.
//
// THE DUAL BOUND + THE GUARDS (every stop condition is covered — `AUTO_MODE_STOP_REASONS`):
//   • `max-turns`   — the turn-count cap (`autoModeMaxTurns`); the loop never exceeds it.
//   • `interrupt`   — the caller's `AbortSignal` fired (a user interrupt) — checked before each turn AND
//                     after each commit (so an abort mid-delay stops the NEXT turn).
//   • `no-eligible` — arbitration produced no speaker (everyone muted/left; `manual`/ban-last yielded none).
//   • `locked`      — a concurrent turn holds the per-chat lock (a human send interleaved — §6); the chain
//                     yields rather than fighting for the lock.
//
// IDENTITY (D19): every chained turn is `triggeredBy` the CHAIN-STARTER (the human who armed auto-mode), NOT
// a fresh caller — the caller wires that into the `runTurn` callback's `TurnPrep`. ban-last / `allowSelfResponses`
// live inside the injected `nextSpeaker` (the arbitration seam), so this loop is policy-free orchestration.

import type { MessageView } from "@orb/contracts/chat";
import type {
  AutoModeResult,
  AutoModeStopReason,
  CastName,
  SpeakerRef,
} from "../contract/arbitration";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors";
import type { TurnOutcome } from "../contract/results";

/** The auto-mode loop inputs (file-local — the verb passes a literal). */
interface AutoModeParams {
  /** The turn-count cap (`GroupConfig.autoModeMaxTurns`, ≥1). */
  readonly maxTurns: number;
  /** Inter-turn delay (`GroupConfig.autoModeDelayMs`); 0 ⇒ no wait. */
  readonly delayMs: number;
  /** Sleep, INJECTED (tests pass a no-op; prod a real timer) — determinism (D46). */
  readonly delay: (ms: number) => Promise<void>;
  /** A user interrupt — the chain stops at the next checkpoint when aborted. */
  readonly signal?: AbortSignal | undefined;
  /** Re-arbitrate: resolve the NEXT single speaker given the previous one (ban-last/self-response policy is
   *  the caller's, applied INSIDE here). `null` ⇒ no eligible speaker → stop. */
  readonly nextSpeaker: (lastSpeaker: SpeakerRef | null) => Promise<CastName | null>;
  /** Run ONE turn for the resolved speaker (the round driver / a single-speaker round) → its outcome. */
  readonly runTurn: (speaker: CastName) => Promise<TurnOutcome>;
  /** The speaker immediately before the chain (ban-last seed); null at chain start. */
  readonly initialLastSpeaker?: SpeakerRef | null | undefined;
}

/** A per-chat lock refusal (`runTurn` threw `locked`) — a concurrent turn holds the lock (§6). */
function isLockedRefusal(err: unknown): boolean {
  return err instanceof ChatOperationError && err.code === CHAT_OP_CODES.locked;
}

/** One chained turn: arbitrate → run. Returns a stop reason (no eligible / lock) OR the committed messages +
 *  the speaker that spoke (to seed the next ban-last). Non-lock turn errors propagate (the engine already
 *  emitted `turnAborted`). */
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

/**
 * Run the auto-mode AI→AI chain (chat.md Part III §6). Returns how many turns ran, why it stopped, and the
 * committed messages across the chain. Deterministic given the injected `delay` + the arbitration/run
 * callbacks; the cap, the abort signal, eligibility, and the lock are the four stop conditions.
 */
export async function runAutoMode(params: AutoModeParams): Promise<AutoModeResult> {
  const messages: MessageView[] = [];
  let last: SpeakerRef | null = params.initialLastSpeaker ?? null;
  let turns = 0;
  const stop = (stopReason: AutoModeStopReason): AutoModeResult => ({
    turns,
    stopReason,
    messages,
  });
  // Read the VOLATILE abort flag through a call (it can flip mid-loop — a direct `signal?.aborted` re-read
  // would be narrowed stale by TS across the loop body).
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
