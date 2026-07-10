// tests/support/chat/tape — the provider-response TAPE + the FIFO scripted runner (neo's
// `tests/support/harness/` tape/runner, re-derived against ORB's verb surface — N4). A `tape()` scripts an
// ORDERED list of role responses; `scriptedRunner(tape)` presents them as the ONE seam orb's chat engine
// injects — `RunChatTurnOp = (req: TurnRequest) => AsyncIterable<TurnStreamChunk>` (contract/context.ts) —
// dequeuing the next entry per turn (FIFO). This is the structural fix behind the fake-vs-real R3 finding:
// every chat int test today hand-rolls its own `runChatTurn` async-generator; the tape makes real-wired the
// default shape.
//
// ORB-vs-NEO DIVERGENCE (the re-derivation, not a transplant):
//   • ONE seam, not two. Neo split group/solo runners; orb has ONE `runChatTurn` role ("the domain calls a
//     role, never a backend") — a group round / auto-mode chain calls it N times, so the tape scripts N
//     entries and the runner dequeues in speaker order. A test that under-scripts (fewer entries than the
//     round drives) gets a LOUD exhaustion throw — never a silent cycle (unlike the prod `scripted-override`
//     seam, which cycles by design).
//   • rateLimit / error surface as a THROW, not a response field. Orb's `TurnStreamChunk`/`TurnEconomics`
//     carry NO rateLimit/error field — that lives on the provider `ChatResult` BELOW this seam (sealed in
//     infra/providers, where retry/backoff also lives). So at the `runChatTurn` seam a rate-limit is a
//     TERMINAL thrown `ProviderError` (retries already exhausted below); the engine maps any post-turnStarted
//     throw to `turnAborted` (reason `error`; `user` for an AbortError) then rethrows (engine.ts). Assert with
//     the `toThrowProviderError(kind)` matcher (support/matchers.ts).

import type { ProviderErrorKind } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import type { RunChatTurnOp } from "../../../packages/server/src/domain/chat/contract/context";
import type {
  TurnEconomics,
  TurnRequest,
  TurnStreamChunk,
} from "../../../packages/server/src/domain/chat/contract/results";

/** The default per-turn economics a scripted `reply` reports (matches the hand-rolled chat int fakes —
 *  `{ tokensIn: 4, tokensOut: 2, model: "test-model" }` — so a converted test's stats deltas stay identical).
 *  `content` defaults to the reply text; any field is overridable per `reply`. */
const DEFAULT_ECONOMICS = { tokensIn: 4, tokensOut: 2, model: "test-model" } as const;

/** Per-`reply` overrides: an optional reasoning-channel delta + an economics patch (folded over the defaults). */
export interface ReplyOptions {
  /** A reasoning-channel delta streamed BEFORE the text (the native `<think>` path); omitted ⇒ no reasoning. */
  readonly reasoning?: string;
  /** Economics fields to override on the terminal `final` chunk (content/tokens/cost/finishReason/…). */
  readonly economics?: Partial<TurnEconomics>;
}

/** Per-`error` overrides: the `ProviderError` shape a failed turn throws at the seam. */
export interface ErrorOptions {
  readonly kind?: ProviderErrorKind;
  readonly message?: string;
  readonly retryable?: boolean;
  readonly apiErrorStatus?: number;
}

/** Per-`rateLimit` overrides. Fixed `kind:"rate_limit"`, `retryable:true` (see the file header divergence). */
export interface RateLimitOptions {
  readonly message?: string;
  /** Epoch-ms the rate-limit window resets (rides `ProviderError.resetsAt`). */
  readonly resetsAt?: number;
}

type TapeEntry =
  | { readonly kind: "reply"; readonly text: string; readonly options: ReplyOptions }
  | { readonly kind: "throw"; readonly error: ProviderError };

/** A fluent, ordered script of role responses (the FIFO the runner dequeues). Each method returns the tape so a
 *  multi-turn round scripts inline: `tape().reply("hi").reply("there").error()`. */
export interface Tape {
  /** Script a successful turn: an optional reasoning delta, one text delta, then a terminal `final` economics. */
  readonly reply: (text: string, options?: ReplyOptions) => Tape;
  /** Script a failed turn — the seam throws a `ProviderError` (default `kind:"server"`, non-retryable). */
  readonly error: (options?: ErrorOptions) => Tape;
  /** Script a rate-limited turn — the seam throws a `ProviderError` (`kind:"rate_limit"`, retryable). */
  readonly rateLimit: (options?: RateLimitOptions) => Tape;
  /** The scripted entries in order (the runner reads this). */
  readonly entries: readonly TapeEntry[];
}

/** Build an empty tape; chain `.reply()/.error()/.rateLimit()` to script it. */
export function tape(): Tape {
  const entries: TapeEntry[] = [];
  const self: Tape = {
    entries,
    reply: (text, options = {}): Tape => {
      entries.push({ kind: "reply", text, options });
      return self;
    },
    error: (options = {}): Tape => {
      entries.push({
        kind: "throw",
        error: new ProviderError({
          kind: options.kind ?? "server",
          retryable: options.retryable ?? false,
          message: options.message ?? "scripted error",
          ...(options.apiErrorStatus !== undefined
            ? { apiErrorStatus: options.apiErrorStatus }
            : {}),
        }),
      });
      return self;
    },
    rateLimit: (options = {}): Tape => {
      entries.push({
        kind: "throw",
        error: new ProviderError({
          kind: "rate_limit",
          retryable: true,
          message: options.message ?? "scripted rate limit",
          ...(options.resetsAt !== undefined ? { resetsAt: options.resetsAt } : {}),
        }),
      });
      return self;
    },
  };
  return self;
}

/** Replay ONE tape entry as the role stream: honor a pre-aborted signal (→ AbortError, `turnAborted`
 *  reason `user`), throw a `throw`-entry's `ProviderError`, else stream reasoning?→text→final. */
async function* replay(entry: TapeEntry, req: TurnRequest): AsyncGenerator<TurnStreamChunk> {
  await Promise.resolve();
  if (req.signal?.aborted === true) {
    const aborted = new Error("scripted abort");
    aborted.name = "AbortError";
    throw aborted;
  }
  if (entry.kind === "throw") {
    throw entry.error;
  }
  if (entry.options.reasoning !== undefined) {
    yield { kind: "reasoning", text: entry.options.reasoning };
  }
  yield { kind: "text", text: entry.text };
  yield {
    kind: "final",
    economics: { content: entry.text, ...DEFAULT_ECONOMICS, ...entry.options.economics },
  };
}

/** Options for {@link scriptedRunner}. `onRequest` captures each wire `TurnRequest` before the entry replays
 *  (the guided-routing / `assertStaticPrefixStable` pins inspect the assembled prompt). */
export interface ScriptedRunnerOptions {
  readonly onRequest?: (req: TurnRequest) => void;
}

/** Build the `RunChatTurnOp` the chat engine injects (`ctx.runChatTurn`) from a tape — a FIFO cursor over the
 *  scripted entries. Over-drawing (more turns than scripted) throws LOUD rather than cycling, so an
 *  under-scripted group round / auto-mode chain fails the test instead of replaying a stale reply. */
export function scriptedRunner(script: Tape, options: ScriptedRunnerOptions = {}): RunChatTurnOp {
  let cursor = 0;
  return (req: TurnRequest): AsyncIterable<TurnStreamChunk> => {
    options.onRequest?.(req);
    const entry = script.entries[cursor];
    cursor += 1;
    if (entry === undefined) {
      throw new Error(
        `scripted tape exhausted: turn #${cursor} has no scripted response (tape scripted ${script.entries.length}). Add a .reply()/.error() for every driven speaker.`,
      );
    }
    return replay(entry, req);
  };
}
