// Preserve streamed text and provider refusal identity while adapting push delivery to chat's pull stream.
import type { ChatDeltaEvent, ChatEvent, ChatRequest, ChatResult, ChatTurnInput } from "@orb/inference";
import { toChatRequest } from "@orb/inference";
import type { TurnRequest, TurnStreamChunk } from "../contract/results.ts";

/** The runner's `ChatResult.events` → the domain stream's out-of-band chunks (D41 no-silent-degrade, the READ
 *  end). The bridge CARRIES the infra codes; it does not translate them — chat owns its bus vocabulary, so the
 *  infra→`ChatWarningCode` narrowing lives in the domain (`engine.ts` `toChatWarning`), the mirror of the
 *  IMAGE role's hop where compose hands the domain a narrowed infra code and
 *  `domain/chat/verbs/generate-image.ts` does the re-map. Deduped here because one runner can repeat a code
 *  within a single result; the pipeline dedupes again across recursion depths.
 *  Extracted so the bridge body stays under the cognitive-complexity cap.
 *
 *  TWO event kinds cross, not one. `refusal` rides as its OWN chunk kind because it is not a degrade of our
 *  settings but the model's verdict on the request; it collapses to a single chunk for the same reason the
 *  warnings dedupe (a result can carry more than one), and it crosses PAYLOAD-FREE — the provider's
 *  `category`/`explanation`/`fallbackModel` are raw strings the chat bus may not carry, and they stay on
 *  `ChatResult.events` for the wire-outcome ring.
 *
 *  WHAT DELIBERATELY DOES NOT CROSS: `rate_limit`. It is an OPERATOR signal about the account's remaining
 *  headroom, not a fact about this reply — the turn succeeded — and its payload is raw provider strings. It
 *  has a home already (the `provider.rate_limit` log line beside the emit, and the event on `ChatResult`);
 *  telling every member of a room that the host is at 80% of a rate limit mid-story is noise, not honesty.
 *  Same for `compaction`/`api_retry`/`status`/`auth_status`/`model_downgrade`/`permission_leak`: diagnostics
 *  with no user decision behind them. If one ever earns a room-public surface it needs its own bus member and
 *  its own ruling, not a quiet addition here. */
function outOfBandChunks(events: readonly ChatEvent[]): TurnStreamChunk[] {
  const seen = new Map<string, TurnStreamChunk>();
  let refused = false;
  for (const event of events) {
    if (event.kind === "refusal") {
      refused = true;
    }
    if (event.kind === "warning") {
      const { kind: _kind, at: _at, ...warning } = event;
      // KEYED ON THE WHOLE WARNING, not on the code alone (#1440): with the drop's structured half carried
      // through, two DIFFERENT dropped knobs share the `sampling_knob_dropped` code and are two distinct
      // degrades — a code-keyed dedupe would silently pick one and lie about the other. Identical repeats
      // (the same runner re-raising the same drop) still collapse to one.
      seen.set(JSON.stringify(warning), { kind: "warning", ...warning });
    }
  }
  return refused ? [...seen.values(), { kind: "refusal" }] : [...seen.values()];
}

const FRESH_RESPONSE_BY_KIND: Readonly<Record<TurnRequest["kind"], boolean>> = {
  send: false,
  swipe: true,
  continue: true,
  generate: true,
  impersonate: true,
  opening: true,
  auto: true,
  force: true,
};

/** The domain {@link TurnRequest} → the BACKEND-NEUTRAL {@link ChatTurnInput}. No wire branch lives here: how
 *  the history and the tools reach a backend (Agent SDK seed frames + an MCP server, or a history array + a
 *  `tools[]` declaration) is `@orb/inference`'s `toChatRequest` (D177). What
 *  stays is this seam's own concern — the deployment's cache-depth FLOOR, layered onto SHAPE's depth. */
function chatTurnInputOf(args: {
  readonly req: TurnRequest;
  readonly onDelta: (delta: ChatDeltaEvent) => void;
  readonly promptCacheMinDepth: number;
}): ChatTurnInput {
  const { req, onDelta } = args;
  return {
    // The WHOLE resolved connection rides the request (§8.4-3): provider row, credential, folded features,
    // extras and capability — the runtime picks the wire off it; nothing here re-derives a routing fact.
    connection: req.connection,
    onObservedResult: req.onObservedResult,
    params: req.intent,
    responseCache: FRESH_RESPONSE_BY_KIND[req.kind] ? { enabled: false, refresh: false } : undefined,
    attachmentQuality: req.attachmentQuality,
    systemPrompt: { static: req.prompt.static, dynamic: req.prompt.dynamic },
    // Carried so the wire-capture sink keys the recorded body by chat (the debug endpoint's `chatId` filter),
    // and so the stateful backend keys its resume cache by it.
    chatId: req.chatId,
    history: req.history,
    // The cache breakpoint DEPTH (role switches from the end — `backends/wire/cache-control.ts` owns the axis).
    // SHAPE computes the turn's MINIMUM SAFE depth and returns nothing at all when the stable prefix is
    // disrupted; the admin knob is a FLOOR layered on top, so it can only push the breakpoint DEEPER (more of
    // the tail kept volatile), never shallower — a shallower breakpoint pins bytes that change every turn, which
    // is a guaranteed wasted cache write, not a preference. SHAPE's abort therefore stays absolute: no safe depth
    // ⇒ no breakpoint, whatever the knob says.
    cacheBreakpointDepth: req.cacheBreakpointFromEnd === null ? undefined : Math.max(req.cacheBreakpointFromEnd, args.promptCacheMinDepth),
    ...(req.tools !== undefined ? { tools: req.tools } : {}),
    ...(req.responseFormat !== undefined ? { responseFormat: req.responseFormat } : {}),
    ...(req.reasoningTags !== undefined ? { reasoningTags: req.reasoningTags } : {}),
    onDelta,
    signal: req.signal,
  };
}

/** The terminal `final` chunk: the infra {@link ChatResult} folded onto the domain's committed economics. */
function finalTurnChunk(req: TurnRequest, result: ChatResult): TurnStreamChunk {
  return {
    kind: "final",
    economics: {
      content: result.reply,
      reasoning: result.reasoning || null,
      model: req.connection.model,
      // ATTRIBUTION (§5.3b): the provider REGISTRY id and the connection row that generated this swipe —
      // denormalised on purpose so a read outlives an edited or deleted connection.
      provider: req.connection.provider.id,
      connectionId: req.connection.connectionId,
      servedModel: result.usage.servedModel,
      tokenDetails: result.usage.tokenDetails,
      ...(result.usage.responseCache === undefined ? {} : { responseCache: result.usage.responseCache }),
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      reasoningTokens: result.usage.reasoningTokens,
      contextWindow: result.usage.contextWindow,
      costUsd: result.usage.costUsd,
      costProvenance: result.usage.costProvenance,
      costDetails: result.usage.costDetails,
      // The replayable reasoning blocks (A1) — stored on the variant; the assembly reads them back.
      reasoningParts: result.reasoningParts ?? null,
      ...(result.textSignatures === undefined ? {} : { textSignatures: result.textSignatures }),
      maxOutputTokens: result.usage.maxOutputTokens,
      // The provider's per-turn MODEL-CALL count, renamed across the seam (`numTurns` → `modelCalls`)
      // because "turn" already means a CHAT turn on this side. It is what makes `tokensOut` (a sum
      // over the calls) legible against `maxOutputTokens` (a per-call ceiling).
      modelCalls: result.numTurns,
      // The APPLIED effort the wire reported (inference audit B1) — never `req.intent.effort`, which a transport may
      // have dropped or a mandatory clamp raised; the requested value already rides `params`.
      reasoningEffort: result.appliedEffort,
      ttftMs: result.ttftMs,
      finishReason: result.finishReason,
      stopReason: result.stopReason,
      terminalReason: result.terminalReason,
      generationId: result.generationId ?? null,
      // §5.3c class 3 — the per-provider sidecar, already NARROWED by the runtime to the closed union
      // (`backends/wire/provider-metadata.ts`). This seam carries it and decides nothing about its shape: the
      // per-vendor spelling is backend knowledge, and re-deriving it here would put provider shape above the
      // package boundary. Absent on a provider with no first-party arm.
      ...(result.providerMetadata !== undefined ? { providerMetadata: result.providerMetadata } : {}),
      ...(result.toolCalls !== undefined ? { toolCalls: result.toolCalls } : {}),
      // §6.7: the pictures a modalities-capable chat model emitted inside this completion, forwarded RAW.
      // The engine owns materialize + CAS store (the bytes must land under the room HOST, which this seam
      // does not know) and the span emission; carrying them is all this bridge may honestly do.
      ...(result.images !== undefined ? { replyImages: result.images } : {}),
      // §8.8: the depth's replayable thinking, carried across the seam so the engine's tool loop can hand it
      // back on the next leg. The wire produced them honestly (never gated on the carry knob) — WHETHER they
      // ride back is the pipeline's decision, off the one funnel answer.
      ...(result.reasoningParts !== undefined ? { reasoningParts: result.reasoningParts } : {}),
    },
  };
}

/** A PUSH→PULL adapter: the infra runner reports progress by callback (`onDelta`) and completion by promise,
 *  while the chat role consumes an AsyncIterable. The pump buffers pushed chunks and parks the consumer on a
 *  one-shot arrival promise while the buffer is empty, so no delta is dropped between two `next()` calls and a
 *  slow consumer never blocks the producer. `fail` is terminal and rethrows into the consumer AFTER the
 *  already-buffered chunks drain (a mid-stream failure must not swallow the text the user already saw). */
function createChunkPump<T>(): {
  readonly push: (...chunks: readonly T[]) => void;
  readonly close: () => void;
  readonly fail: (err: unknown) => void;
  readonly drain: () => AsyncGenerator<T>;
} {
  const queue: T[] = [];
  let done = false;
  // BOXED, not a bare `unknown`: a rejection value is compared for PRESENCE, and `null`/`undefined` are
  // legal rejection values. The box makes "a failure was recorded" a different question from "the failure
  // is truthy" — the pre-extraction inline pump answered the second and silently ended the stream instead
  // of rethrowing when a runner rejected with a nullish value.
  let failure: { readonly err: unknown } | null = null;
  let notify: (() => void) | null = null;
  const wake = (): void => {
    notify?.();
    notify = null;
  };
  const push = (...chunks: readonly T[]): void => {
    queue.push(...chunks);
    wake();
  };
  const close = (): void => {
    done = true;
    wake();
  };
  const fail = (err: unknown): void => {
    failure = { err };
    done = true;
    wake();
  };
  async function* drain(): AsyncGenerator<T> {
    for (;;) {
      if (queue.length > 0) {
        yield queue.shift() as T;
        continue;
      }
      if (done) {
        if (failure !== null) {
          throw failure.err;
        }
        return;
      }
      const arrival = Promise.withResolvers<void>();
      notify = arrival.resolve;
      await arrival.promise;
    }
  }
  return { push, close, fail, drain };
}

/** The domain→infra turn bridge: maps a domain {@link TurnRequest} to the neutral turn and through `toChatRequest`
 *  to the infra {@link ChatRequest} (the per-wire delivery of history and tools is inference's; this seam adds the
 *  admin cache-depth floor), runs it through the injected infra `runChatTurn`, and adapts its
 *  Promise+onDelta shape back onto the chat role's streaming AsyncIterable. Extracted so the four-layer
 *  fidelity harness drives THIS real mapping (injecting only the leaf infra surface), not a facsimile. */
export function createRunChatTurnBridge(deps: {
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  /** The deployment's prompt-cache depth FLOOR (`AppSettings.promptCacheMinDepth`, Settings › Admin › System
   *  tuning) — read PER TURN so an admin flip governs the next request with no restart (the D126 thunk
   *  precedent). Optional: absent reads as the born-in-DB floor 0, which is `Math.max`'s identity, so a
   *  harness that omits it produces byte-identical wire bodies. */
  readonly promptCacheMinDepth?: () => number;
}): (req: TurnRequest) => AsyncIterable<TurnStreamChunk> {
  return async function* runChatTurn(req: TurnRequest): AsyncIterable<TurnStreamChunk> {
    const pump = createChunkPump<TurnStreamChunk>();
    const onDelta = (delta: ChatDeltaEvent): void => {
      pump.push({ kind: delta.kind, text: delta.text });
    };

    // The wire SHAPE is `@orb/inference`'s to decide off the connection's own `api` (validated ∈ the provider's
    // `apis` on write and at resolve, §7.3) — including the refusal of a chat row with no chat api.
    const chatReq = toChatRequest(chatTurnInputOf({ req, onDelta, promptCacheMinDepth: deps.promptCacheMinDepth?.() ?? 0 }));

    // @orb-waive caught-failure-ownership(runChatTurn): the `.catch` below hands the rejection to `pump.fail`, which
    // stores it in `createChunkPump`'s `failure` box; `pump.drain()` rethrows it (`throw failure.err`) to the consumer of
    // `yield* pump.drain()`. Ends if `drain` stops rethrowing the recorded failure.
    void deps
      .runChatTurn(chatReq)
      .then((result) => {
        // BEFORE the terminal `final` (which ends the drain): the turn's honest-degrade warnings. Without this
        // the runner's `events` died at this seam and D41 held only in the logs, never in the product.
        pump.push(...outOfBandChunks(result.events), finalTurnChunk(req, result));
        pump.close();
      })
      .catch((err: unknown) => {
        pump.fail(err);
      });

    yield* pump.drain();
  };
}
