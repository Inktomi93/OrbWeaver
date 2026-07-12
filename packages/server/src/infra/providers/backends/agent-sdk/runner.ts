// infra/providers/backends/agent-sdk/runner — the SDK-message-stream → {@link ChatResult} REDUCER plus
// the chat-turn orchestration (spawn + per-chat resume). The reducer (`consumeTurnStream`) is isolated
// from the spawn so it is unit-testable with a hand-built `AsyncIterable<SDKMessage>` (the live spawn +
// auth are exercised by the verify harness). The body is a thin dispatch loop; every per-message-kind
// branch is a small named handler threading ONE {@link TurnAccumulator}. Errors collapse onto the one
// SDK-free {@link ProviderError} surface (no `sessionId` / `sdkError` leak into the contract result).

import type {
  Query,
  SDKAssistantMessageError,
  SDKControlGetContextUsageResponse,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { secondsToMs } from "@orb/kit/time";
import { getLog } from "#foundation/observability";
import type {
  AgentSdkChatRequest,
  ChatEvent,
  ChatResult,
  ChatUsage,
  ContextUsage,
  RateLimitSnapshot,
  ResolvedWarning,
} from "../../contract";
import { normalizeFinishReason, ProviderError } from "../../contract";
import { resolveDynamicContext } from "../../resolve-chat";
import { refreshHostSubTokenIfMode1 } from "./host-token";
import {
  logProviderChannel,
  logProviderCompaction,
  logProviderDrift,
  logProviderError,
  logProviderLeak,
  logProviderRateLimit,
  logProviderRefusal,
  logProviderRetry,
  logProviderSession,
  logProviderTurn,
} from "./log";
import type { SeededSessionDecision, SessionCache } from "./session";
import {
  buildSystemPrompt,
  disciplineOptions,
  dynamicContextOptions,
  observabilityOptions,
  toSdkGeneration,
} from "./translate";
import type { AgentSdkDeps, TurnStreamContext } from "./types";
import {
  assertInitFrameShape,
  classifyAssistantError,
  classifyResultSubtype,
  classifyTerminalReason,
} from "./verify";

/** The `options.title` for a chat turn: a chatId-derived METADATA label in the SDK's own transcript store,
 *  never the user's chat title text. RP-content doctrine — user content stays out of runtime metadata (the
 *  SDK persists the title to its JSONL store; a real title could leak RP into that store). Also suppresses
 *  the SDK's extra Haiku title-gen call. No chat (`fetchModels`-style call) → the bare namespace. */
function sdkChatTitle(chatId: string | undefined): string {
  return chatId !== undefined ? `orb:${chatId}` : "orbweaver";
}
/** The best-effort context-usage probe budget (ms). A slow/hung `getContextUsage()` must NEVER stall the
 *  turn — past this the probe resolves `undefined` and `contextUsage` is simply absent. */
const CONTEXT_USAGE_PROBE_TIMEOUT_MS = 2000;
/** Strip an Anthropic provider prefix so a namespaced billed model id compares equal to a bare requested
 *  one (top-level so the downgrade check doesn't recompile it per turn). */
const ANTHROPIC_PREFIX_RE = /^anthropic\//;

/** Cap on the retained CLI stderr tail (~2KB) attached to a spawn-death `provider.error` line. CLI stderr
 *  is runtime diagnostics (spawn/auth failures), NOT model output — bounded + truncated so a runaway CLI
 *  can't flood a log line, and dropped entirely on a healthy turn. */
const STDERR_TAIL_BYTES = 2048;

/** A bounded last-N-bytes tail of the CLI subprocess stderr for one turn. `append` keeps only the trailing
 *  {@link STDERR_TAIL_BYTES}; `tail()` returns the retained slice (empty when the CLI wrote nothing). */
class StderrTail {
  private buf = "";

  append(chunk: string): void {
    const next = this.buf + chunk;
    this.buf = next.length > STDERR_TAIL_BYTES ? next.slice(next.length - STDERR_TAIL_BYTES) : next;
  }

  tail(): string {
    return this.buf;
  }
}

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
  // mode-1 (Max sub) ONLY: proactively refresh an expired host OAuth token BEFORE the spawn, so the
  // symlinked `.credentials.json` is fresh. The spawned runtime's own refresh can't persist through the
  // ephemeral-dir symlink (tmp+rename clobbers it), so this closes the "auth_failed every few hours" hole.
  // Best-effort + never throws — a failed refresh lets the spawn surface the SDK's own error unchanged.
  await refreshHostSubTokenIfMode1(req.credential, deps.refreshHostSubToken);

  // Route the dynamic (volatile) system-prompt half per the funnel-RESOLVED `dynamicContextChannel`.
  const { systemPrompt, dynamicHook } = routeDynamicContext(req);
  const gen = toSdkGeneration(req.params, req.capability);
  const { resume, disposition } = await resolveResume(req, sessions);
  logSessionDecision(req.chatId, resume, disposition);

  // CLI subprocess stderr for THIS turn (runtime diagnostics — attached only on a spawn-death error line,
  // dropped on success). Bounded so a runaway CLI can't flood the log.
  const stderrTail = new StderrTail();

  const abortController = new AbortController();
  if (req.signal !== undefined) {
    if (req.signal.aborted) {
      abortController.abort();
    } else {
      req.signal.addEventListener("abort", () => abortController.abort(), { once: true });
    }
  }

  const chatId = req.chatId;
  const stream = deps.query({
    prompt: req.prompt,
    options: {
      ...disciplineOptions(req.credential, req.orSkinTierModels, gen.envOverrides),
      ...observabilityOptions(),
      ...gen.options,
      ...dynamicHook,
      includePartialMessages: req.onDelta !== undefined,
      model: req.model,
      maxTurns: 1,
      sessionStore: sessions.store,
      // Capture the CLI's stderr for THIS turn — runtime diagnostics only, attached to a spawn-death
      // error line (never a healthy turn). Bounded by the tail's own cap.
      stderr: (data: string): void => stderrTail.append(data),
      ...(resume !== undefined ? { resume } : {}),
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(req.signal !== undefined ? { abortController } : {}),
      // METADATA-only title (chatId-derived, never the user's chat title text — RP-content doctrine).
      title: sdkChatTitle(chatId),
    },
  });

  // `await` (not a bare return) so a synchronous throw from `query()` / the reducer surfaces as a
  // rejected promise at the call site rather than a sync throw.
  const result = await consumeTurnStream(stream, {
    model: req.model,
    resumed: resume !== undefined,
    disposition,
    now: deps.now,
    stderrTail: () => stderrTail.tail(),
    // The context-fill probe: `getContextUsage()` on the LIVE query handle (still open when the reducer
    // runs it), bounded so a hung control call never stalls the turn. `stream` IS the SDK `Query` (it
    // carries the control methods alongside the async-iterator); a hand-built test stream lacks them, so
    // the probe self-guards on the method's presence.
    probeContextUsage: () => probeContextUsage(stream),
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

/**
 * Route the dynamic (volatile, per-turn) system-prompt half per the RESOLVED `dynamicContextChannel` the
 * ONE funnel decides (`resolveDynamicContext` × the model's `turns.midConversationSystem` gate). ONE path
 * for all three agent-sdk modes (sub / OR-key / vllm — they share one wire shape, so one caps profile):
 *   • "system-block" — join static+dynamic into the ONE system-prompt string (authoritative, but a change
 *     re-writes the whole cached system block).
 *   • "message-tail" — send ONLY the static half as the system prompt and inject the dynamic half via a
 *     `UserPromptSubmit` hook (cache-safe; lands at the message tail; probe-verified). Reached only on a
 *     model whose wire-shape honors mid-conv-system — else the funnel already DEMOTED it to system-block.
 * Also emits the `provider.channel` decision line (part 05 §3b) — no model-id branch, just the resolved
 * facts. Returns the systemPrompt to send plus the (possibly empty) hook option spread.
 */
function routeDynamicContext(req: AgentSdkChatRequest): {
  systemPrompt: string | string[] | undefined;
  dynamicHook: Pick<Parameters<AgentSdkDeps["query"]>[0]["options"] & object, "hooks"> | object;
} {
  // The funnel's verdict — the SAME resolution `toSdkGeneration`→`resolveChat` runs (pure, deterministic);
  // its warnings ride the turn via that path, so this local resolution takes a throwaway sink.
  const channel = resolveDynamicContext(req.params, req.capability, []);
  const midConvCapable = req.capability.turns?.midConversationSystem ?? false;
  // Demotion happened iff the user asked for the tail (`hook`) but the model can't honor it.
  const demoted = req.params.advanced?.dynamicContext === "hook" && !midConvCapable;
  logProviderChannel({ channel, midConvCapable, demoted });

  if (channel === "system-block") {
    return { systemPrompt: buildSystemPrompt(req.systemPrompt), dynamicHook: {} };
  }
  // message-tail: static half rides the system prompt (cached prefix); dynamic half rides the hook.
  const staticOnly = buildSystemPrompt({ static: req.systemPrompt.static, dynamic: "" });
  return {
    systemPrompt: staticOnly,
    dynamicHook: dynamicContextOptions(req.systemPrompt.dynamic),
  };
}

/**
 * Resolve which session this turn resumes. With a `seed` on the request (the PD-7 canon feed), the
 * per-chat cache verifies the recorded session's transcript still MATCHES the seed and reseeds a fresh
 * deterministic session on divergence (edit/swipe/window-slide/cold-cache) — so the model's session
 * history always equals the model-visible transcript the domain rendered. Without a seed, fall back to
 * the bare per-chat resume map (the pre-PD-7 behavior).
 */
async function resolveResume(
  req: AgentSdkChatRequest,
  sessions: SessionCache,
): Promise<{ resume: string | undefined; disposition: SeededSessionDecision["disposition"] }> {
  if (req.chatId === undefined) {
    // No chat → no resume cache; the SDK mints a fresh session.
    return { resume: undefined, disposition: "fresh" };
  }
  if (req.seed !== undefined) {
    const decision = await sessions.ensureSeededSession(req.chatId, req.seed);
    return { resume: decision.sessionId ?? undefined, disposition: decision.disposition };
  }
  // The seedless bare-resume path (pre-PD-7): a cache hit resumes, a miss runs fresh.
  const recorded = sessions.resolveResumeId(req.chatId);
  return {
    resume: recorded,
    disposition: recorded !== undefined ? "resumed" : "fresh",
  };
}

/** Log a NON-trivial session decision up front (`provider.session`, debug). The hot `resumed`/`fresh`
 *  paths stay quiet; the full disposition still rides the `provider.turn` line. No-op outside a chat. */
function logSessionDecision(
  chatId: string | undefined,
  resume: string | undefined,
  disposition: SeededSessionDecision["disposition"],
): void {
  if (chatId === undefined || disposition === "resumed" || disposition === "fresh") {
    return;
  }
  logProviderSession({ chatId, sessionId: resume ?? null, disposition });
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

/** Map the SDK's `getContextUsage()` response onto the SDK-FREE {@link ContextUsage} contract shape (only
 *  the four operator-legible aggregates; the SDK's per-category / grid / memory-file breakdown is a UI
 *  render shape, not turn economics, so it stays inside the family). */
function toContextUsage(res: SDKControlGetContextUsageResponse): ContextUsage {
  return {
    totalTokens: res.totalTokens,
    maxTokens: res.maxTokens,
    percentage: res.percentage,
    model: res.model,
  };
}

/**
 * Best-effort context-fill probe against the LIVE {@link Query} handle (still open when the reducer calls
 * this, right after the stream drains). BOUNDED ({@link CONTEXT_USAGE_PROBE_TIMEOUT_MS}) and TOTALLY
 * non-fatal: a throw, a rejection, or a hang past the bound all resolve `undefined` (⇒ `contextUsage`
 * absent) — the turn must never fail or delay on this diagnostic. A hand-built test stream is not a real
 * `Query` (no `getContextUsage`), so the method presence is guarded before the call.
 */
async function probeContextUsage(query: Query): Promise<ContextUsage | undefined> {
  if (typeof query.getContextUsage !== "function") {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Race the probe against a timeout that resolves undefined — a hung control call can't stall the turn.
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), CONTEXT_USAGE_PROBE_TIMEOUT_MS);
    // The timer must not keep the process alive past the turn if it's the last pending handle.
    timer.unref?.();
  });
  let usage: ContextUsage | undefined;
  try {
    const res = await Promise.race([query.getContextUsage(), timeout]);
    usage = res !== undefined ? toContextUsage(res) : undefined;
  } catch {
    // A rejected control call is a diagnostic miss, never a turn failure — leave `usage` absent.
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
  return usage;
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
  // The stream drained cleanly (result frame seen) and the Query is still open — run the bounded, totally
  // non-fatal context-fill probe now, THEN finish (so `contextUsage` rides both the result AND the ONE
  // `provider.turn` log line finish() emits). Absent probe (agent-mode / tests) ⇒ contextUsage undefined.
  return acc.finish(await runContextUsageProbe(ctx.probeContextUsage));
}

/** Invoke the optional context-usage probe, resolving `undefined` when there is none. Split out so the
 *  `await` sees a concrete `Promise<ContextUsage | undefined>` (biome's `useAwaitThenable` can't resolve
 *  the thenable through the optional callback property inline). */
async function runContextUsageProbe(
  probe: (() => Promise<ContextUsage | undefined>) | undefined,
): Promise<ContextUsage | undefined> {
  if (probe === undefined) {
    return;
  }
  return await probe();
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
  /** Whether the SDK claimed a pre-warmed subprocess spare for this turn (a cold-start indicator — a
   *  missed spare means the turn paid full spawn latency); `null` on the error path / when unreported. */
  warmSpareClaimed: boolean | null = null;
  numTurns = 0;
  /** The init frame's `apiKeySource` (oauth/user/… — the sub-vs-key canary), for the `provider.turn` line. */
  apiKeySource: string | null = null;
  /** The model the init/result frame reported serving — drift shows as this ≠ the requested `ctx.model`. */
  servedModel: string | null = null;
  rateLimit: RateLimitSnapshot | null = null;
  /** Estimated CoT token count off the `thinking_tokens` system frames (`estimated_tokens` is a running
   *  total — last wins); `null` when the turn produced none. */
  reasoningTokens: number | null = null;
  /** Count of `redacted_thinking` content blocks — encrypted CoT with NO readable text (the OR-skin
   *  mode-2 path emits these). `>0` means the model DID reason but the trace was withheld — distinct from
   *  "no thinking at all" (empty `reasoning` + zero here). Surfaced as `reasoningRedacted` on the result. */
  redactedThinkingBlocks = 0;
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
      reasoningTokens: this.reasoningTokens, // estimated via the thinking_tokens system frames
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

  /** Emit the ONE-per-turn `provider.turn` anchor line (success or failure). NEVER the prompt/reply — RP
   *  content is the DB's, never a log line; every field here is metadata. `contextUsage` rides the SUCCESS
   *  line only (the error path never probes). */
  private logTurn(ok: boolean, contextUsage?: ContextUsage): void {
    logProviderTurn({
      ...(this.ctx.chatId !== undefined ? { chatId: this.ctx.chatId } : {}),
      ...(this.sessionId !== "" ? { sessionId: this.sessionId } : {}),
      ...(this.apiKeySource !== null ? { apiKeySource: this.apiKeySource } : {}),
      requestedModel: this.ctx.model,
      ...(this.servedModel !== null ? { servedModel: this.servedModel } : {}),
      ...(this.ctx.disposition !== undefined ? { disposition: this.ctx.disposition } : {}),
      terminalReason: this.terminalReason,
      durationMs: this.ctx.now() - this.startedAt,
      ttftMs: this.ttftMs,
      ok,
      ...(contextUsage !== undefined ? { contextUsage } : {}),
      usage: {
        tokensIn: this.usageAcc.tokensIn,
        tokensOut: this.usageAcc.tokensOut,
        reasoningTokens: this.reasoningTokens,
        cacheReadTokens: this.usageAcc.cacheReadTokens,
        cacheWriteTokens: this.usageAcc.cacheWriteTokens,
        costUsd: this.usageAcc.costUsd,
        warmSpareClaimed: this.warmSpareClaimed,
      },
    });
  }

  /** Build the success result + log the `provider.turn` anchor (NEVER the prompt/reply — RP content is the
   *  DB's, never a log line). No `sessionId` on the result — the session is backend-internal. `contextUsage`
   *  is the bounded best-effort context-fill probe's output (absent when it failed / wasn't run). */
  finish(contextUsage?: ContextUsage): ChatResult {
    this.logTurn(true, contextUsage);
    return {
      reply: this.reply.trim(),
      reasoning: this.reasoning,
      reasoningRedacted: this.redactedThinkingBlocks > 0,
      stopReason: this.stopReason,
      terminalReason: this.terminalReason,
      // stop_reason is the per-message signal; fall back to the loop-level terminalReason.
      finishReason: normalizeFinishReason(this.stopReason ?? this.terminalReason),
      ttftMs: this.ttftMs,
      warmSpareClaimed: this.warmSpareClaimed,
      durationApiMs: this.durationApiMs,
      apiErrorStatus: this.apiErrorStatus,
      numTurns: this.numTurns,
      ...(contextUsage !== undefined ? { contextUsage } : {}),
      usage: this.buildUsage(),
      events: this.events,
      rateLimit: this.rateLimit,
    };
  }

  /** Translate any thrown error into the caller-visible {@link ProviderError}, log the `provider.turn`
   *  anchor + the `provider.error` provenance line uniformly, re-throw. The backend-internal `sessionId`
   *  rides the error's `toLog()` (never the SDK-free result). A spawn/CLI-death class (server/unknown)
   *  attaches the bounded CLI stderr tail. */
  finishWithError(error: unknown): never {
    throw this.logAndBuildError(error);
  }

  /** Normalize the thrown value into a {@link ProviderError} (stamping `sessionId`), emit the turn +
   *  error log lines, and return it for the caller to throw. */
  private logAndBuildError(error: unknown): ProviderError {
    const perr = this.toProviderError(error);
    this.logTurn(false);
    // The CLI stderr tail is diagnostics for a spawn/subprocess death (kind server/unknown) — a classified
    // upstream error (rate_limit/invalid/…) came from the model stream, not the process, so no tail applies.
    const spawnDeath = perr.kind === "server" || perr.kind === "unknown";
    const tail = spawnDeath ? this.ctx.stderrTail?.() : undefined;
    logProviderError(
      perr,
      tail !== undefined && tail.length > 0 ? { stderrTail: tail } : undefined,
    );
    return perr;
  }

  /** The backend-internal session id as error provenance (kept OFF the SDK-free result, ON the error's
   *  `toLog()`); `undefined` before the first `session_id` frame. Handler throw sites pass this so their
   *  {@link ProviderError} already carries it; the wrap paths below add it for un-classified throws. */
  get errorSessionId(): string | undefined {
    return this.sessionId !== "" ? this.sessionId : undefined;
  }

  /** Map any thrown value onto the one {@link ProviderError} surface. A classified handler error already
   *  carries its `sessionId` (stamped at the throw site); the abort/server WRAP paths add it here. */
  private toProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }
    const sessionId = this.errorSessionId;
    if (isAbortError(error)) {
      return new ProviderError({
        kind: "aborted",
        retryable: false,
        message: messageOf(error),
        model: this.ctx.model,
        ...(sessionId !== undefined ? { sessionId } : {}),
        cause: error,
      });
    }
    // Unexpected throw (spawn/network/subprocess) — wrap as a transient server error.
    return new ProviderError({
      kind: "server",
      retryable: true,
      message: messageOf(error),
      model: this.ctx.model,
      ...(sessionId !== undefined ? { sessionId } : {}),
      cause: error,
    });
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
    } else if (block.type === "redacted_thinking") {
      // Encrypted CoT — NO readable text to append; count it so `reasoningRedacted` can report that the
      // model thought but the trace was withheld (the OR-skin mode-2 path emits these).
      acc.redactedThinkingBlocks += 1;
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
  } else if (message.subtype === "thinking_tokens") {
    // `estimated_tokens` is the running TOTAL for the turn (not a delta) — last sighting wins.
    acc.reasoningTokens = message.estimated_tokens;
  } else if (
    message.subtype === "model_refusal_fallback" ||
    message.subtype === "model_refusal_no_fallback"
  ) {
    handleRefusal(acc, message);
  } else if (message.subtype === "init") {
    // SHAPE GUARD: throw loudly if the init frame lost session_id/apiKeySource (see verify.ts).
    assertInitFrameShape(message);
    // Capture the sub-vs-key canary + the served model for the provider.turn line (shape now verified).
    acc.apiKeySource = message.apiKeySource;
    acc.servedModel = message.model;
  }
}

/**
 * A safety-classifier refusal. `model_refusal_fallback` means the runtime retried on a fallback model
 * (never configured by this backend today, but the event is handled so a future `fallbackModel` opt-in
 * doesn't silently drop it); `model_refusal_no_fallback` means the turn ends as an error — the refusal
 * event carries the category so the caller sees more than a bare `finishReason:"filter"`.
 */
function handleRefusal(
  acc: TurnAccumulator,
  message:
    | (Narrow<"system"> & { subtype: "model_refusal_fallback" })
    | (Narrow<"system"> & { subtype: "model_refusal_no_fallback" }),
): void {
  const retried = message.subtype === "model_refusal_fallback";
  acc.emit({
    kind: "refusal",
    at: acc.ctx.now(),
    model: message.original_model,
    category: message.api_refusal_category ?? null,
    explanation: message.api_refusal_explanation ?? null,
    retried,
    fallbackModel: retried ? message.fallback_model : null,
  });
  // Metadata-only log (the category, never the refusal banner text — RP-adjacent content stays off logs).
  logProviderRefusal({ category: message.api_refusal_category ?? null, retried });
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
  // Fold into the taxonomy: keep the retry fields, add the classified kind + an authFailure ban-risk canary
  // flag (an auth failure mid-retry is the ban risk the locked decisions guard against). `provider.retry` is
  // always warn; the `authFailure:true` field makes the ban-risk canary greppable without a second event.
  logProviderRetry({
    attempt: message.attempt,
    maxRetries: message.max_retries,
    errorStatus: message.error_status,
    sdkError: message.error,
    kind: cls.kind,
    authFailure: cls.kind === "auth_failed",
  });
  // Fail-fast: the runtime sometimes retries a NON-retryable failure (a context-overflow a backend
  // reports as 400/413/422) with exponential backoff — minutes of grinding that reads as a hung turn.
  // Throw now with the REAL classification (unwinds into consumeTurnStream's catch → finishWithError).
  if (!cls.retryable) {
    throw new ProviderError({
      kind: cls.kind,
      retryable: false,
      message: `agent-sdk: backend returned a non-retryable error (${cls.kind}); aborting futile retry`,
      model: acc.ctx.model,
      detail: message.error,
      ...(acc.errorSessionId !== undefined ? { sessionId: acc.errorSessionId } : {}),
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
    logProviderCompaction({ compactError: message.compact_error });
  }
}

function handleRateLimitEvent(acc: TurnAccumulator, message: Narrow<"rate_limit_event">): void {
  const info = message.rate_limit_info;
  // The SDK reports resetsAt in epoch SECONDS — normalize to our canonical epoch-ms at the boundary.
  const resetsAtMs = secondsToMs(info.resetsAt);
  const overageResetsAtMs = secondsToMs(info.overageResetsAt);
  const isUsingOverage = info.isUsingOverage;
  acc.rateLimit = {
    status: info.status,
    rateLimitType: info.rateLimitType,
    resetsAt: resetsAtMs,
    utilization: info.utilization,
    isUsingOverage,
    surpassedThreshold: info.surpassedThreshold,
    overageStatus: info.overageStatus,
    overageResetsAt: overageResetsAtMs,
    overageDisabledReason: info.overageDisabledReason,
    errorCode: info.errorCode,
  };
  acc.emit({
    kind: "rate_limit",
    at: acc.ctx.now(),
    status: info.status,
    rateLimitType: info.rateLimitType,
    resetsAt: resetsAtMs,
    utilization: info.utilization,
    isUsingOverage,
  });
  if (info.status === "allowed" && isUsingOverage !== true) {
    logProviderRateLimit(false, {
      rateLimitType: info.rateLimitType,
      utilization: info.utilization,
    });
  } else {
    // `isUsingOverage` is the ban-risk canary — the subscription limit is exhausted and overage credits
    // are in play. The `banRisk` flag drives the warn level + the `isUsingOverage` field greps it apart.
    logProviderRateLimit(true, {
      status: info.status,
      rateLimitType: info.rateLimitType,
      resetsAt: resetsAtMs,
      utilization: info.utilization,
      isUsingOverage: isUsingOverage ?? false,
      overageStatus: info.overageStatus,
      overageDisabledReason: info.overageDisabledReason,
      errorCode: info.errorCode,
    });
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
    // Served/billed model differs from requested — the SDK has no `model_downgrade` SYSTEM frame in this
    // version (audited); the result-frame billed-model set IS the drift signal. Record the served model
    // for the provider.turn line and emit provider.drift + the ChatEvent.
    acc.servedModel = billed[0] ?? acc.servedModel;
    logProviderDrift({ requested: acc.ctx.model, billed });
    acc.emit({ kind: "model_downgrade", at: acc.ctx.now(), requested: acc.ctx.model, billed });
  }
}

/** Firewall tripwire: with the LOCKED tool-less config `permission_denials` MUST be empty. A non-empty
 *  list means a tool call was attempted (and the SDK denied it) — i.e. a tool leaked past the roleplay
 *  firewall. Never expected to fire; when it does, make it LOUD (a `permission_leak` event + an error log)
 *  rather than swallowing a firewall breach. The tool_input is deliberately NOT surfaced (it could carry
 *  content); only the tool names ride the event. */
function checkPermissionDenials(acc: TurnAccumulator, message: Narrow<"result">): void {
  // Optional-chain the length: the SDK type declares `permission_denials` required, but tolerating an
  // absent array keeps the tripwire from itself crashing a live turn if a future SDK drops the field.
  const denials = message.permission_denials;
  if (denials === undefined || denials.length === 0) {
    return;
  }
  const toolNames = denials.map((d) => d.tool_name);
  acc.emit({ kind: "permission_leak", at: acc.ctx.now(), toolNames });
  logProviderLeak({ model: acc.ctx.model, toolNames });
}

function handleResult(acc: TurnAccumulator, message: Narrow<"result">): void {
  acc.numTurns = message.num_turns;
  acc.terminalReason = message.terminal_reason ?? null;
  acc.stopReason = message.stop_reason ?? acc.stopReason;
  accumulateUsage(acc, message);
  detectModelDowngrade(acc, message);
  checkPermissionDenials(acc, message);

  if (message.subtype === "success") {
    acc.ttftMs = message.ttft_ms ?? null;
    acc.durationApiMs = message.duration_api_ms;
    acc.apiErrorStatus = message.api_error_status ?? null;
    acc.warmSpareClaimed = message.warm_spare_claimed ?? null;
    if (message.is_error) {
      // Defensive: a "success" subtype flagged is_error — treat as a server error.
      throw new ProviderError({
        kind: "server",
        retryable: true,
        message: "agent-sdk: result success-subtype flagged is_error",
        model: acc.ctx.model,
        ...(acc.errorSessionId !== undefined ? { sessionId: acc.errorSessionId } : {}),
      });
    }
    return;
  }
  throw buildResultError(acc, message);
}

/** The chosen classification for an error-RESULT + the RAW provenance string it was derived from (rides
 *  `detail` on the ProviderError). */
interface ResultClassification {
  readonly classified: ReturnType<typeof classifyAssistantError>;
  readonly detail: string;
}

/** Pick the most-specific classification for an error-RESULT. Precedence, most-specific first: the
 *  retry/rate-limit assistant-error code, then the loop-level terminal reason, then the generic subtype.
 *  Split out of {@link buildResultError} so the three-way precedence stays a flat guard chain (no nested
 *  ternary). */
function classifyResult(
  acc: TurnAccumulator,
  message: Narrow<"result"> & { subtype: Exclude<Narrow<"result">["subtype"], "success"> },
): ResultClassification {
  const rateLimited = acc.rateLimit?.status === "rejected" || acc.lastRetryError === "rate_limit";
  const specific: SDKAssistantMessageError | undefined = rateLimited
    ? "rate_limit"
    : acc.lastRetryError;
  if (specific !== undefined) {
    return { classified: classifyAssistantError(specific), detail: specific };
  }
  if (message.terminal_reason !== undefined) {
    return {
      classified: classifyTerminalReason(message.terminal_reason),
      detail: message.terminal_reason,
    };
  }
  return { classified: classifyResultSubtype(message.subtype), detail: message.subtype };
}

/**
 * Build the {@link ProviderError} for an error-RESULT. Classification precedence (most-specific first):
 *   1. the specific assistant-error code from a retry / rate-limit event (`lastRetryError`) — it keeps a
 *      rate-limit/auth identity that exhausted its retries;
 *   2. the loop-level `terminal_reason` (13-member union) — distinguishes the ban-risk / context-overflow
 *      / input-error causes the 4-member subtype flattens (`blocking_limit`, `prompt_too_long`, …);
 *   3. the generic `subtype` (the coarse fallback).
 * The chosen provenance string rides `terminalReason`/`detail` on the error so an operator sees the exact
 * cause behind the normalized `kind`.
 */
function buildResultError(
  acc: TurnAccumulator,
  message: Narrow<"result"> & { subtype: Exclude<Narrow<"result">["subtype"], "success"> },
): ProviderError {
  const { classified, detail } = classifyResult(acc, message);
  const errorDetail = message.errors.length > 0 ? `: ${message.errors.join("; ")}` : "";
  return new ProviderError({
    kind: classified.kind,
    retryable: classified.retryable,
    message: `agent-sdk: turn failed (${message.subtype})${errorDetail}`,
    model: acc.ctx.model,
    detail,
    ...(acc.errorSessionId !== undefined ? { sessionId: acc.errorSessionId } : {}),
    ...(message.terminal_reason !== undefined ? { terminalReason: message.terminal_reason } : {}),
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
  // `signature_delta` (the SUB/mode-1 path's ONLY thinking delta — it signs+withholds raw CoT, so the
  // final `thinking` block is empty) carries a signature, not text: it falls through to this ignore path
  // by design. No crash, nothing to surface (the withheld-reasoning signal rides `reasoningRedacted`).
}
