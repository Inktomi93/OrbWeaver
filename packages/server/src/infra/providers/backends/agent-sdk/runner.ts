// infra/providers/backends/agent-sdk/runner — the SDK-message-stream → {@link ChatResult} REDUCER plus
// the chat-turn orchestration (spawn + per-chat resume). The reducer (`consumeTurnStream`) is isolated
// from the spawn so it is unit-testable with a hand-built `AsyncIterable<SDKMessage>` (the live spawn +
// auth are exercised by the verify harness). The body is a thin dispatch loop; every per-message-kind
// branch is a small named handler threading ONE {@link TurnAccumulator}. Errors collapse onto the one
// SDK-free {@link ProviderError} surface (no `sessionId` / `sdkError` leak into the contract result).

import type { SDKAssistantMessageError, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { secondsToMs } from "@orb/kit/time";
import { getLog } from "#foundation/observability";
import type {
  AgentSdkChatRequest,
  ChatEvent,
  ChatResult,
  ChatUsage,
  RateLimitSnapshot,
  ResolvedWarning,
} from "../../contract";
import { normalizeFinishReason, ProviderError } from "../../contract";
import type { SessionCache } from "./session";
import {
  buildSystemPrompt,
  disciplineOptions,
  observabilityOptions,
  toSdkGeneration,
} from "./translate";
import type { AgentSdkDeps, TurnStreamContext } from "./types";
import { assertInitFrameShape, classifyAssistantError, classifyResultSubtype } from "./verify";

/** The static session title (suppresses the SDK's extra Haiku title-gen call — our chat title is the
 *  display source of truth). */
const SDK_TITLE_CHAT = "orbweaver";
/** Strip an Anthropic provider prefix so a namespaced billed model id compares equal to a bare requested
 *  one (top-level so the downgrade check doesn't recompile it per turn). */
const ANTHROPIC_PREFIX_RE = /^anthropic\//;

/** Minimal, dependency-free error-message extraction (avoids surfacing a non-Error's `[object Object]`). */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A caller-cancel surfaces as an AbortError/DOMException (`name === "AbortError"` across Node fetch,
 *  undici, and the SDK's AbortController). */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Run ONE agent-sdk chat turn: project the request into SDK options, resume the per-chat session when
 * cached (the Max-sub prompt-cache survival), spawn, and reduce the stream. `maxTurns:1` + no MCP server
 * is the roleplay-firewall asymmetry the agent runner inverts. `async` (not a bare Promise return) so a
 * synchronous throw from `query()` surfaces as a rejected promise.
 */
export async function runChatTurn(
  req: AgentSdkChatRequest,
  deps: AgentSdkDeps,
  sessions: SessionCache,
): Promise<ChatResult> {
  const systemPrompt = buildSystemPrompt(req.systemPrompt);
  const gen = toSdkGeneration(req.params, req.capability);
  const resume = req.chatId !== undefined ? sessions.resolveResumeId(req.chatId) : undefined;

  const abortController = new AbortController();
  if (req.signal !== undefined) {
    if (req.signal.aborted) {
      abortController.abort();
    } else {
      req.signal.addEventListener("abort", () => abortController.abort(), { once: true });
    }
  }

  const stream = deps.query({
    prompt: req.prompt,
    options: {
      ...disciplineOptions(req.credential, gen.envOverrides),
      ...observabilityOptions(),
      ...gen.options,
      includePartialMessages: req.onDelta !== undefined,
      model: req.model,
      maxTurns: 1,
      sessionStore: sessions.store,
      ...(resume !== undefined ? { resume } : {}),
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(req.signal !== undefined ? { abortController } : {}),
      title: SDK_TITLE_CHAT,
    },
  });

  const chatId = req.chatId;
  // `await` (not a bare return) so a synchronous throw from `query()` / the reducer surfaces as a
  // rejected promise at the call site rather than a sync throw.
  const result = await consumeTurnStream(stream, {
    model: req.model,
    resumed: resume !== undefined,
    now: deps.now,
    ...(chatId !== undefined ? { chatId } : {}),
    ...(req.onEvent !== undefined ? { onEvent: req.onEvent } : {}),
    ...(req.onDelta !== undefined ? { onDelta: req.onDelta } : {}),
    ...(chatId !== undefined
      ? { onSessionId: (sessionId: string): void => sessions.record(chatId, sessionId) }
      : {}),
    configuredMaxOutputTokens: gen.envOverrides.maxOutputTokens ?? null,
    configuredMaxContextTokens: gen.envOverrides.maxContextTokens ?? null,
  });
  // Surface resolve-chat's dropped/ignored-knob notes (from `toSdkGeneration`) as `warning` events on the
  // reduced result + via `onEvent` — never silently dropped. (The OR runners do the equivalent; the
  // strategy-isolation seal forbids sharing the openrouter builder, so this backend owns its own.)
  return appendWarnings(result, gen.warnings, deps.now(), req.onEvent);
}

/** Append resolve-chat's `warning` events to the reduced result and fire `onEvent` for each. Returns the
 *  result unchanged when there are no warnings. */
function appendWarnings(
  result: ChatResult,
  warnings: readonly ResolvedWarning[],
  at: number,
  onEvent: ((event: ChatEvent) => void) | undefined,
): ChatResult {
  if (warnings.length === 0) {
    return result;
  }
  const events = warnings.map(
    ({ code, message }): ChatEvent => ({ kind: "warning", at, code, message }),
  );
  for (const event of events) {
    onEvent?.(event);
  }
  return { ...result, events: [...result.events, ...events] };
}

/**
 * Reduce an SDK message stream into a {@link ChatResult}. Throws {@link ProviderError} on any failure
 * result; classifies compaction / retries / rate-limits / auth into `events` along the way. The first
 * `session_id` seen is reported via `ctx.onSessionId` (the resume-cache seam).
 *
 * Exported so the test suite can drive it with synthetic streams; the live spawn lives in `runChatTurn`.
 */
export async function consumeTurnStream(
  stream: AsyncIterable<SDKMessage>,
  ctx: TurnStreamContext,
): Promise<ChatResult> {
  const acc = new TurnAccumulator(ctx);
  try {
    for await (const message of stream) {
      if (typeof message.session_id === "string" && message.session_id.length > 0) {
        acc.observeSessionId(message.session_id);
      }
      dispatch(acc, message);
    }
  } catch (error) {
    return acc.finishWithError(error);
  }
  return acc.finish();
}

/** Top-level dispatch — narrows the union and forwards to the per-kind handler. Unknown message types
 *  log at debug and continue (the locked config can't emit tool/task/hook/memory events, but a future
 *  SDK minor could add shapes). */
function dispatch(acc: TurnAccumulator, message: SDKMessage): void {
  switch (message.type) {
    case "assistant":
      handleAssistant(acc, message);
      break;
    case "system":
      handleSystem(acc, message);
      break;
    case "rate_limit_event":
      handleRateLimitEvent(acc, message);
      break;
    case "auth_status":
      handleAuthStatus(acc, message);
      break;
    case "result":
      handleResult(acc, message);
      break;
    case "stream_event":
      handleStreamEvent(acc, message);
      break;
    default:
      getLog().debug({ messageType: message.type }, "agent-sdk: unhandled sdk message type");
  }
}

type Narrow<K extends SDKMessage["type"]> = Extract<SDKMessage, { type: K }>;

// ── Mutable accumulator ──────────────────────────────────────────────────────────────────────────────
/** Owns all the turn-local state the reducer threads; `finish()`/`finishWithError()` are the only exits,
 *  so the success/error log entries are uniform. */
class TurnAccumulator {
  reply = "";
  /** Extended-thinking text — accumulated ONLY from the final assistant message; the `thinking_delta`
   *  stream path drives the live UI but is NOT accumulated (the final message re-reads the same text). */
  reasoning = "";
  sessionId = "";
  stopReason: string | null = null;
  terminalReason: string | null = null;
  ttftMs: number | null = null;
  durationApiMs: number | null = null;
  apiErrorStatus: number | null = null;
  numTurns = 0;
  rateLimit: RateLimitSnapshot | null = null;
  /** The specific assistant-error code from the last api_retry — error RESULTS carry only a generic
   *  subtype, so this preserves a rate-limit/auth identity that exhausted its retries. */
  lastRetryError: SDKAssistantMessageError | undefined;
  readonly events: ChatEvent[] = [];
  /** Mutable numeric accumulators — the final read-only {@link ChatUsage} is assembled in `finish()`
   *  (its fields are `readonly`, so accumulation can't happen on it directly). */
  readonly usageAcc = {
    tokensIn: 0,
    tokensOut: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
    contextWindow: 0,
    maxOutputTokens: 0,
    webSearchRequests: 0,
    costUsd: 0,
  };
  readonly startedAt: number;
  readonly ctx: TurnStreamContext;

  constructor(ctx: TurnStreamContext) {
    this.ctx = ctx;
    this.startedAt = ctx.now();
  }

  /** Assemble the read-only {@link ChatUsage} from the mutable accumulators + the constant nulls. */
  private buildUsage(): ChatUsage {
    return {
      model: this.ctx.model,
      ...this.usageAcc,
      reasoningTokens: null, // the SDK doesn't expose a CoT token count
      costDetails: null, // the SDK gives a single total costUSD — no prompt/completion split
      isByok: null, // Max-sub path — no BYOK concept applies
    };
  }

  observeSessionId(id: string): void {
    // First sighting (sessionId still the "" sentinel) → report it to the resume-cache seam exactly once.
    const firstSighting = this.sessionId === "";
    this.sessionId = id;
    if (firstSighting) {
      this.ctx.onSessionId?.(id);
    }
  }

  emit(event: ChatEvent): void {
    this.events.push(event);
    this.ctx.onEvent?.(event);
  }

  /** Build the success result + log the metadata summary (NEVER the prompt/reply — RP content is the
   *  DB's, never a log line). No `sessionId` on the result — the session is backend-internal. */
  finish(): ChatResult {
    getLog().info(
      {
        model: this.ctx.model,
        tokensIn: this.usageAcc.tokensIn,
        tokensOut: this.usageAcc.tokensOut,
        cacheReadTokens: this.usageAcc.cacheReadTokens,
        cacheWriteTokens: this.usageAcc.cacheWriteTokens,
        costUsd: this.usageAcc.costUsd,
        stopReason: this.stopReason,
        terminalReason: this.terminalReason,
        ttftMs: this.ttftMs,
        apiErrorStatus: this.apiErrorStatus,
        eventCount: this.events.length,
        resumed: this.ctx.resumed,
        durationMs: this.ctx.now() - this.startedAt,
      },
      "agent-sdk: turn complete",
    );
    return {
      reply: this.reply.trim(),
      reasoning: this.reasoning,
      stopReason: this.stopReason,
      terminalReason: this.terminalReason,
      // stop_reason is the per-message signal; fall back to the loop-level terminalReason.
      finishReason: normalizeFinishReason(this.stopReason ?? this.terminalReason),
      ttftMs: this.ttftMs,
      durationApiMs: this.durationApiMs,
      apiErrorStatus: this.apiErrorStatus,
      numTurns: this.numTurns,
      usage: this.buildUsage(),
      events: this.events,
      rateLimit: this.rateLimit,
    };
  }

  /** Translate any thrown error into the caller-visible {@link ProviderError}, log uniformly, re-throw. */
  finishWithError(error: unknown): never {
    if (error instanceof ProviderError) {
      getLog().error(
        {
          model: this.ctx.model,
          resumed: this.ctx.resumed,
          kind: error.kind,
          retryable: error.retryable,
        },
        "agent-sdk: turn failed",
      );
      throw error;
    }
    if (isAbortError(error)) {
      getLog().info(
        { model: this.ctx.model, resumed: this.ctx.resumed },
        "agent-sdk: turn aborted by caller",
      );
      throw new ProviderError({
        kind: "aborted",
        retryable: false,
        message: messageOf(error),
        cause: error,
      });
    }
    // Unexpected throw (spawn/network/subprocess) — wrap as a transient server error.
    const wrapped = new ProviderError({
      kind: "server",
      retryable: true,
      message: messageOf(error),
      cause: error,
    });
    getLog().error(
      {
        model: this.ctx.model,
        resumed: this.ctx.resumed,
        kind: wrapped.kind,
        err: wrapped.message,
      },
      "agent-sdk: turn threw",
    );
    throw wrapped;
  }
}

// ── Per-message-kind handlers ──────────────────────────────────────────────────────────────────────────

function handleAssistant(acc: TurnAccumulator, message: Narrow<"assistant">): void {
  acc.stopReason = message.message.stop_reason ?? acc.stopReason;
  for (const block of message.message.content) {
    if (block.type === "text") {
      acc.reply += block.text;
    } else if (block.type === "thinking") {
      const thinkingText = (block as { thinking?: string }).thinking;
      if (typeof thinkingText === "string") {
        acc.reasoning += thinkingText;
      }
    }
  }
}

function handleSystem(acc: TurnAccumulator, message: Narrow<"system">): void {
  // if-blocks (not a `switch`) on the nested subtype: biome's `noUnnecessaryConditions` cannot resolve
  // `Extract<SDKMessage, {type:"system"}>` over the large SDK union and false-flags every case as
  // unreachable — tsc narrows each branch correctly (the four system subtypes are real). Unknown
  // subtypes fall through to a no-op (a future SDK addition must not crash a live chat).
  if (message.subtype === "compact_boundary") {
    handleCompactBoundary(acc, message);
  } else if (message.subtype === "api_retry") {
    handleApiRetry(acc, message);
  } else if (message.subtype === "status") {
    handleStatus(acc, message);
  } else if (message.subtype === "init") {
    // SHAPE GUARD: throw loudly if the init frame lost session_id/apiKeySource (see verify.ts).
    assertInitFrameShape(message);
  }
}

function handleCompactBoundary(
  acc: TurnAccumulator,
  message: Narrow<"system"> & { subtype: "compact_boundary" },
): void {
  const meta = message.compact_metadata;
  acc.emit({
    kind: "compaction",
    at: acc.ctx.now(),
    trigger: meta.trigger,
    preTokens: meta.pre_tokens,
    postTokens: meta.post_tokens,
    durationMs: meta.duration_ms,
    preserved: meta.preserved_messages !== undefined || meta.preserved_segment !== undefined,
  });
  getLog().info(
    { trigger: meta.trigger, preTokens: meta.pre_tokens, postTokens: meta.post_tokens },
    "agent-sdk: context compacted",
  );
}

function handleApiRetry(
  acc: TurnAccumulator,
  message: Narrow<"system"> & { subtype: "api_retry" },
): void {
  acc.lastRetryError = message.error;
  acc.emit({
    kind: "api_retry",
    at: acc.ctx.now(),
    attempt: message.attempt,
    maxRetries: message.max_retries,
    retryDelayMs: message.retry_delay_ms,
    errorStatus: message.error_status,
  });
  const cls = classifyAssistantError(message.error);
  const detail = {
    attempt: message.attempt,
    maxRetries: message.max_retries,
    errorStatus: message.error_status,
    sdkError: message.error,
  };
  if (cls.kind === "auth_failed") {
    // An auth failure mid-retry is the ban-risk canary — escalate above the routine warn.
    getLog().error(detail, "agent-sdk: AUTH FAILURE during api retry (ban-risk canary)");
  } else {
    getLog().warn(detail, "agent-sdk: api retry");
  }
  // Fail-fast: the runtime sometimes retries a NON-retryable failure (a context-overflow a backend
  // reports as 400/413/422) with exponential backoff — minutes of grinding that reads as a hung turn.
  // Throw now with the REAL classification (unwinds into consumeTurnStream's catch → finishWithError).
  if (!cls.retryable) {
    throw new ProviderError({
      kind: cls.kind,
      retryable: false,
      message: `agent-sdk: backend returned a non-retryable error (${cls.kind}); aborting futile retry`,
      ...(typeof message.error_status === "number" ? { apiErrorStatus: message.error_status } : {}),
    });
  }
}

function handleStatus(
  acc: TurnAccumulator,
  message: Narrow<"system"> & { subtype: "status" },
): void {
  acc.emit({
    kind: "status",
    at: acc.ctx.now(),
    status: message.status ?? "unknown",
    compactResult: message.compact_result,
  });
  if (message.compact_result === "failed") {
    getLog().warn({ compactError: message.compact_error }, "agent-sdk: compaction failed");
  }
}

function handleRateLimitEvent(acc: TurnAccumulator, message: Narrow<"rate_limit_event">): void {
  const info = message.rate_limit_info;
  // The SDK reports resetsAt in epoch SECONDS — normalize to our canonical epoch-ms at the boundary.
  const resetsAtMs = secondsToMs(info.resetsAt);
  const isUsingOverage = info.isUsingOverage;
  acc.rateLimit = {
    status: info.status,
    rateLimitType: info.rateLimitType,
    resetsAt: resetsAtMs,
    utilization: info.utilization,
    isUsingOverage,
    surpassedThreshold: info.surpassedThreshold,
  };
  acc.emit({
    kind: "rate_limit",
    at: acc.ctx.now(),
    status: info.status,
    rateLimitType: info.rateLimitType,
    resetsAt: resetsAtMs,
    utilization: info.utilization,
  });
  if (info.status === "allowed" && isUsingOverage !== true) {
    getLog().debug(
      { rateLimitType: info.rateLimitType, utilization: info.utilization },
      "agent-sdk: rate-limit ok",
    );
  } else {
    // `isUsingOverage` is the ban-risk canary — the subscription limit is exhausted and overage credits
    // are in play. Alert louder than a plain warning.
    getLog()[isUsingOverage === true ? "error" : "warn"](
      {
        status: info.status,
        rateLimitType: info.rateLimitType,
        resetsAt: resetsAtMs,
        utilization: info.utilization,
        isUsingOverage: isUsingOverage ?? false,
      },
      isUsingOverage === true
        ? "agent-sdk: RATE LIMIT OVERAGE — ban risk"
        : "agent-sdk: rate-limited",
    );
  }
}

function handleAuthStatus(acc: TurnAccumulator, message: Narrow<"auth_status">): void {
  acc.emit({
    kind: "auth_status",
    at: acc.ctx.now(),
    isAuthenticating: message.isAuthenticating,
    error: message.error,
  });
  // WARN unconditionally — auth state changing mid-turn is the ban-risk canary the locked decisions name.
  getLog().warn(
    { isAuthenticating: message.isAuthenticating, authError: message.error },
    "agent-sdk: auth status change",
  );
}

/** Accumulate the per-model usage totals + provenance caps off a result message. */
function accumulateUsage(acc: TurnAccumulator, message: Narrow<"result">): void {
  for (const modelUsage of Object.values(message.modelUsage)) {
    acc.usageAcc.tokensIn += modelUsage.inputTokens;
    acc.usageAcc.tokensOut += modelUsage.outputTokens;
    acc.usageAcc.cacheReadTokens += modelUsage.cacheReadInputTokens;
    acc.usageAcc.cacheWriteTokens += modelUsage.cacheCreationInputTokens;
    acc.usageAcc.costUsd += modelUsage.costUSD;
    acc.usageAcc.webSearchRequests += modelUsage.webSearchRequests;
    // Prefer the CONFIGURED cap (what we policy-enforced) over the model's reported capability, so the
    // persisted provenance + the context-fill meter reflect the user's budget, not the hard ceiling.
    acc.usageAcc.contextWindow = Math.max(
      acc.usageAcc.contextWindow,
      acc.ctx.configuredMaxContextTokens ?? modelUsage.contextWindow,
    );
    acc.usageAcc.maxOutputTokens = Math.max(
      acc.usageAcc.maxOutputTokens,
      acc.ctx.configuredMaxOutputTokens ?? modelUsage.maxOutputTokens,
    );
  }
  const cacheCreation = message.usage.cache_creation;
  if (cacheCreation) {
    acc.usageAcc.cacheCreation5mTokens = cacheCreation.ephemeral_5m_input_tokens;
    acc.usageAcc.cacheCreation1hTokens = cacheCreation.ephemeral_1h_input_tokens;
  }
}

/** Silent-downgrade detection: the SDK can route to a different (billed) model than requested (overage /
 *  rate-limit fallback). An Anthropic provider prefix is canonicalized so a namespaced billed key vs a
 *  bare requested model isn't a false alarm. */
function detectModelDowngrade(acc: TurnAccumulator, message: Narrow<"result">): void {
  const canonicalize = (m: string): string => m.replace(ANTHROPIC_PREFIX_RE, "");
  const billed = Object.keys(message.modelUsage);
  const requestedCanon = canonicalize(acc.ctx.model);
  const unexpected = billed.filter((m) => canonicalize(m) !== requestedCanon);
  if (unexpected.length > 0) {
    getLog().error(
      { requested: acc.ctx.model, billed },
      "agent-sdk: model downgrade — billed model differs from requested",
    );
    acc.emit({ kind: "model_downgrade", at: acc.ctx.now(), requested: acc.ctx.model, billed });
  }
}

function handleResult(acc: TurnAccumulator, message: Narrow<"result">): void {
  acc.numTurns = message.num_turns;
  acc.terminalReason = message.terminal_reason ?? null;
  acc.stopReason = message.stop_reason ?? acc.stopReason;
  accumulateUsage(acc, message);
  detectModelDowngrade(acc, message);

  if (message.subtype === "success") {
    acc.ttftMs = message.ttft_ms ?? null;
    acc.durationApiMs = message.duration_api_ms;
    acc.apiErrorStatus = message.api_error_status ?? null;
    if (message.is_error) {
      // Defensive: a "success" subtype flagged is_error — treat as a server error.
      throw new ProviderError({
        kind: "server",
        retryable: true,
        message: "agent-sdk: result success-subtype flagged is_error",
      });
    }
    return;
  }
  throw buildResultError(acc, message);
}

/** Build the {@link ProviderError} for an error-RESULT — prefer the specific assistant-error code (from a
 *  retry / rate-limit event) over the generic subtype so rate-limit + auth failures keep their identity. */
function buildResultError(
  acc: TurnAccumulator,
  message: Narrow<"result"> & { subtype: Exclude<Narrow<"result">["subtype"], "success"> },
): ProviderError {
  const rateLimited = acc.rateLimit?.status === "rejected" || acc.lastRetryError === "rate_limit";
  const specific: SDKAssistantMessageError | undefined = rateLimited
    ? "rate_limit"
    : acc.lastRetryError;
  const classified =
    specific !== undefined
      ? classifyAssistantError(specific)
      : classifyResultSubtype(message.subtype);
  const detail = message.errors.length > 0 ? `: ${message.errors.join("; ")}` : "";
  return new ProviderError({
    kind: classified.kind,
    retryable: classified.retryable,
    message: `agent-sdk: turn failed (${message.subtype})${detail}`,
    ...(classified.kind === "rate_limit" && acc.rateLimit?.resetsAt !== undefined
      ? { resetsAt: acc.rateLimit.resetsAt }
      : {}),
  });
}

// Streaming deltas arrive only with includePartialMessages; tool/task/hook/memory events can't fire with
// the locked config, so non-text/thinking deltas are ignored.
function handleStreamEvent(acc: TurnAccumulator, message: Narrow<"stream_event">): void {
  const raw = (
    message as {
      event?: { type?: string; delta?: { type?: string; text?: string; thinking?: string } };
    }
  ).event;
  if (raw?.type !== "content_block_delta") {
    return;
  }
  const delta = raw.delta;
  if (delta === undefined) {
    return;
  }
  const chatId = castId<ChatId>(acc.ctx.chatId ?? "");
  if (delta.type === "text_delta" && typeof delta.text === "string") {
    acc.ctx.onDelta?.({ chatId, kind: "text", text: delta.text });
    return;
  }
  if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
    // Stream-time only (drives the live reasoning UI); handleAssistant is the canonical accumulation
    // source, so we do NOT accumulate here (avoids double-counting).
    acc.ctx.onDelta?.({ chatId, kind: "reasoning", text: delta.thinking });
  }
}
