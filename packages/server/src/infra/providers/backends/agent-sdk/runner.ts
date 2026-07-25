// SDK-message-stream → {@link ChatResult} reducer plus chat-turn orchestration (spawn + per-chat resume).
// `consumeTurnStream` is isolated from the spawn so it's unit-testable with a hand-built stream.

import type { Query, SDKAssistantMessageError, SDKControlGetContextUsageResponse, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { secondsToMs } from "@orb/kit/time";
import { getLog } from "#foundation/observability";
import type { AgentSdkChatRequest, ChatEvent, ChatResult, ChatUsage, ContextUsage, RateLimitSnapshot, ResolvedWarning } from "../../contract";
import { normalizeFinishReason, ProviderError } from "../../contract";
import { resolveDynamicContext } from "../../resolve-chat";
import { refreshHostSubTokenIfMode1 } from "./host-token";
import {
  logProviderCapability,
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
import { buildSystemPrompt, disciplineOptions, dynamicContextOptions, observabilityOptions, toSdkGeneration } from "./translate";
import type { AgentSdkDeps, TurnStreamContext } from "./types";
import { assertInitFrameShape, classifyAssistantError, classifyResultSubtype, classifyTerminalReason } from "./verify";

/** chatId-derived metadata label only — never the user's chat title text (RP content stays out of the SDK's transcript store). */
function sdkChatTitle(chatId: string | undefined): string {
  return chatId !== undefined ? `orb:${chatId}` : "orbweaver";
}
const CONTEXT_USAGE_PROBE_TIMEOUT_MS = 2000;
const ANTHROPIC_PREFIX_RE = /^anthropic\//;
const STDERR_TAIL_BYTES = 2048;

/** Bounded last-N-bytes tail of the CLI subprocess stderr for one turn. */
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function runChatTurn(req: AgentSdkChatRequest, deps: AgentSdkDeps, sessions: SessionCache): Promise<ChatResult> {
  // Mode-1 (Max sub) only: proactively refresh an expired host OAuth token before the spawn — the spawned
  // runtime's own refresh can't persist through the ephemeral-dir symlink. Best-effort, never throws.
  await refreshHostSubTokenIfMode1(req.credential, deps.refreshHostSubToken);

  const gen = toSdkGeneration(req.params, req.capability);
  logProviderCapability({
    turnId: gen.turnId,
    api: req.api,
    credentialSource: req.credential.source,
    requestedModel: req.model,
    turns: { ...req.capability.turns },
    droppedWarnings: gen.warnings.map((w) => ({ code: w.code, message: w.message })),
  });
  const { systemPrompt, dynamicHook } = routeDynamicContext(req, gen.turnId);
  const { resume, disposition } = await resolveResume(req, sessions);
  logSessionDecision(req.chatId, resume, disposition);

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
  captureAgentSdkWire(req, deps, { systemPrompt, resume, gen });
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
      stderr: (data: string): void => stderrTail.append(data),
      ...(resume !== undefined ? { resume } : {}),
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(req.signal !== undefined ? { abortController } : {}),
      title: sdkChatTitle(chatId),
    },
  });

  const result = await consumeTurnStream(stream, {
    turnId: gen.turnId,
    model: req.model,
    resumed: resume !== undefined,
    disposition,
    now: deps.now,
    stderrTail: () => stderrTail.tail(),
    probeContextUsage: () => probeContextUsage(stream),
    ...(chatId !== undefined ? { chatId } : {}),
    ...(req.onEvent !== undefined ? { onEvent: req.onEvent } : {}),
    ...(req.onDelta !== undefined ? { onDelta: req.onDelta } : {}),
    ...(chatId !== undefined ? { onSessionId: (sessionId: string): void => sessions.record(chatId, sessionId) } : {}),
    configuredMaxOutputTokens: gen.envOverrides.maxOutputTokens ?? null,
    configuredMaxContextTokens: gen.envOverrides.maxContextTokens ?? null,
  });
  return appendWarnings(result, gen.warnings, deps.now(), req.onEvent);
}

// TASK-24: capture the SDK QUERY INPUT — the faithful "final bytes WE send" for the agent-sdk path. The
// literal Anthropic /v1/messages HTTP body is built INSIDE the bundled SDK subprocess (never observable
// here), so we capture what we hand the SDK: the prompt + resolved system prompt + the load-bearing options
// (model, max_tokens, maxContextTokens, disableAutoCompact, resume). Fires only when compose wired a sink.
function captureAgentSdkWire(
  req: AgentSdkChatRequest,
  deps: AgentSdkDeps,
  ctx: { systemPrompt: string | string[] | undefined; resume: string | undefined; gen: ReturnType<typeof toSdkGeneration> },
): void {
  deps.captureWire?.({
    chatId: req.chatId,
    api: req.api,
    backend: "agent-sdk",
    model: req.model,
    body: {
      prompt: req.prompt,
      systemPrompt: ctx.systemPrompt ?? null,
      model: req.model,
      resumed: ctx.resume !== undefined,
      maxTokens: ctx.gen.envOverrides.maxOutputTokens ?? null,
      maxContextTokens: ctx.gen.envOverrides.maxContextTokens ?? null,
      disableAutoCompact: ctx.gen.envOverrides.disableAutoCompact ?? false,
    },
  });
}

/**
 * Route the dynamic system-prompt half per the RESOLVED `dynamicContextChannel`: "system-block" joins
 * static+dynamic into one string; "message-tail" sends only the static half and injects the dynamic half
 * via a `UserPromptSubmit` hook (cache-safe). Reached only on a model whose wire-shape honors mid-conv-system.
 */
function routeDynamicContext(
  req: AgentSdkChatRequest,
  turnId: string,
): {
  systemPrompt: string | string[] | undefined;
  dynamicHook: Pick<Parameters<AgentSdkDeps["query"]>[0]["options"] & object, "hooks"> | object;
} {
  const channel = resolveDynamicContext(req.params, req.capability, []);
  const midConvCapable = req.capability.turns?.midConversationSystem ?? false;
  const demoted = req.params.advanced?.dynamicContext === "hook" && !midConvCapable;
  logProviderChannel({ turnId, channel, midConvCapable, demoted });

  if (channel === "system-block") {
    return { systemPrompt: buildSystemPrompt(req.systemPrompt), dynamicHook: {} };
  }
  const staticOnly = buildSystemPrompt({ static: req.systemPrompt.static, dynamic: "" });
  return {
    systemPrompt: staticOnly,
    dynamicHook: dynamicContextOptions(req.systemPrompt.dynamic),
  };
}

/** With a `seed`, the per-chat cache reseeds a fresh session if the recorded session's transcript diverges. */
async function resolveResume(
  req: AgentSdkChatRequest,
  sessions: SessionCache,
): Promise<{ resume: string | undefined; disposition: SeededSessionDecision["disposition"] }> {
  if (req.chatId === undefined) {
    return { resume: undefined, disposition: "fresh" };
  }
  if (req.seed !== undefined) {
    const decision = await sessions.ensureSeededSession(req.chatId, req.seed);
    return { resume: decision.sessionId ?? undefined, disposition: decision.disposition };
  }
  const recorded = sessions.resolveResumeId(req.chatId);
  return {
    resume: recorded,
    disposition: recorded !== undefined ? "resumed" : "fresh",
  };
}

function logSessionDecision(chatId: string | undefined, resume: string | undefined, disposition: SeededSessionDecision["disposition"]): void {
  if (chatId === undefined || disposition === "resumed" || disposition === "fresh") {
    return;
  }
  logProviderSession({ chatId, sessionId: resume ?? null, disposition });
}

function appendWarnings(result: ChatResult, warnings: readonly ResolvedWarning[], at: number, onEvent: ((event: ChatEvent) => void) | undefined): ChatResult {
  if (warnings.length === 0) {
    return result;
  }
  const events = warnings.map(({ code, message }): ChatEvent => ({ kind: "warning", at, code, message }));
  for (const event of events) {
    onEvent?.(event);
  }
  return { ...result, events: [...result.events, ...events] };
}

function toContextUsage(res: SDKControlGetContextUsageResponse): ContextUsage {
  return {
    totalTokens: res.totalTokens,
    maxTokens: res.maxTokens,
    percentage: res.percentage,
    model: res.model,
  };
}

/** Bounded, non-fatal context-fill probe; a throw/rejection/timeout all resolve `undefined` rather than fail the turn. */
async function probeContextUsage(query: Query): Promise<ContextUsage | undefined> {
  if (typeof query.getContextUsage !== "function") {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), CONTEXT_USAGE_PROBE_TIMEOUT_MS);
    timer.unref();
  });
  let usage: ContextUsage | undefined;
  try {
    const res = await Promise.race([query.getContextUsage(), timeout]);
    usage = res !== undefined ? toContextUsage(res) : undefined;
  } catch {
    // diagnostic miss, not a turn failure
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
  return usage;
}

/** Reduce an SDK message stream into a {@link ChatResult}; throws {@link ProviderError} on any failure result. */
export async function consumeTurnStream(stream: AsyncIterable<SDKMessage>, ctx: TurnStreamContext): Promise<ChatResult> {
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
  return acc.finish(await runContextUsageProbe(ctx.probeContextUsage));
}

// Split out so `await` sees a concrete Promise (biome's useAwaitThenable can't resolve an optional callback property inline).
async function runContextUsageProbe(probe: (() => Promise<ContextUsage | undefined>) | undefined): Promise<ContextUsage | undefined> {
  if (probe === undefined) {
    return;
  }
  return await probe();
}

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
    case "user":
    case "tool_progress":
    case "tool_use_summary":
    case "prompt_suggestion":
    case "conversation_reset":
      getLog().debug({ messageType: message.type }, "agent-sdk: unhandled sdk message type");
      break;
  }
}

type Narrow<K extends SDKMessage["type"]> = Extract<SDKMessage, { type: K }>;

/** Owns all turn-local state; `finish()`/`finishWithError()` are the only exits. */
class TurnAccumulator {
  reply = "";
  // Accumulated ONLY from the final assistant message — the thinking_delta stream path is UI-only, not re-accumulated here.
  reasoning = "";
  sessionId = "";
  stopReason: string | null = null;
  terminalReason: string | null = null;
  ttftMs: number | null = null;
  durationApiMs: number | null = null;
  apiErrorStatus: number | null = null;
  warmSpareClaimed: boolean | null = null;
  numTurns = 0;
  apiKeySource: string | null = null;
  servedModel: string | null = null;
  rateLimit: RateLimitSnapshot | null = null;
  reasoningTokens: number | null = null;
  redactedThinkingBlocks = 0;
  lastRetryError: SDKAssistantMessageError | undefined;
  readonly events: ChatEvent[] = [];
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

  private buildUsage(): ChatUsage {
    return {
      model: this.ctx.model,
      ...this.usageAcc,
      reasoningTokens: this.reasoningTokens,
      costDetails: null,
      isByok: null,
    };
  }

  observeSessionId(id: string): void {
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

  // NEVER logs prompt/reply text — RP content stays in the DB, never a log line.
  private logTurn(ok: boolean, contextUsage?: ContextUsage): void {
    logProviderTurn({
      ...(this.ctx.turnId !== undefined ? { turnId: this.ctx.turnId } : {}),
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

  finish(contextUsage?: ContextUsage): ChatResult {
    this.logTurn(true, contextUsage);
    return {
      reply: this.reply.trim(),
      reasoning: this.reasoning,
      reasoningRedacted: this.redactedThinkingBlocks > 0,
      stopReason: this.stopReason,
      terminalReason: this.terminalReason,
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

  finishWithError(error: unknown): never {
    throw this.logAndBuildError(error);
  }

  private logAndBuildError(error: unknown): ProviderError {
    const perr = this.toProviderError(error);
    this.logTurn(false);
    // CLI stderr tail is diagnostics for a spawn/subprocess death only — a classified upstream error doesn't get one.
    const spawnDeath = perr.kind === "server" || perr.kind === "unknown";
    const tail = spawnDeath ? this.ctx.stderrTail?.() : undefined;
    logProviderError(perr, tail !== undefined && tail.length > 0 ? { stderrTail: tail } : undefined);
    return perr;
  }

  get errorSessionId(): string | undefined {
    return this.sessionId !== "" ? this.sessionId : undefined;
  }

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
      acc.redactedThinkingBlocks += 1;
    }
  }
}

// if-blocks not switch: biome's noUnnecessaryConditions can't resolve Extract<SDKMessage,{type:"system"}> over the large union.
function handleSystem(acc: TurnAccumulator, message: Narrow<"system">): void {
  if (message.subtype === "compact_boundary") {
    handleCompactBoundary(acc, message);
  } else if (message.subtype === "api_retry") {
    handleApiRetry(acc, message);
  } else if (message.subtype === "status") {
    handleStatus(acc, message);
  } else if (message.subtype === "thinking_tokens") {
    acc.reasoningTokens = message.estimated_tokens;
  } else if (message.subtype === "model_refusal_fallback" || message.subtype === "model_refusal_no_fallback") {
    handleRefusal(acc, message);
  } else if (message.subtype === "init") {
    assertInitFrameShape(message);
    acc.apiKeySource = message.apiKeySource;
    acc.servedModel = message.model;
  }
}

function handleRefusal(
  acc: TurnAccumulator,
  message: (Narrow<"system"> & { subtype: "model_refusal_fallback" }) | (Narrow<"system"> & { subtype: "model_refusal_no_fallback" }),
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
  logProviderRefusal({ category: message.api_refusal_category ?? null, retried });
}

function handleCompactBoundary(acc: TurnAccumulator, message: Narrow<"system"> & { subtype: "compact_boundary" }): void {
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
  getLog().info({ trigger: meta.trigger, preTokens: meta.pre_tokens, postTokens: meta.post_tokens }, "agent-sdk: context compacted");
}

function handleApiRetry(acc: TurnAccumulator, message: Narrow<"system"> & { subtype: "api_retry" }): void {
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
  logProviderRetry({
    attempt: message.attempt,
    maxRetries: message.max_retries,
    errorStatus: message.error_status,
    sdkError: message.error,
    kind: cls.kind,
    authFailure: cls.kind === "auth_failed",
  });
  // Fail-fast: the runtime sometimes retries a non-retryable failure with exponential backoff, reading as a hung turn.
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

function handleStatus(acc: TurnAccumulator, message: Narrow<"system"> & { subtype: "status" }): void {
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
  // SDK reports resetsAt in epoch seconds; normalize to canonical epoch-ms at the boundary.
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
  // Warn unconditionally — auth state changing mid-turn is a ban-risk canary.
  getLog().warn({ isAuthenticating: message.isAuthenticating, authError: message.error }, "agent-sdk: auth status change");
}

function accumulateUsage(acc: TurnAccumulator, message: Narrow<"result">): void {
  for (const modelUsage of Object.values(message.modelUsage)) {
    acc.usageAcc.tokensIn += modelUsage.inputTokens;
    acc.usageAcc.tokensOut += modelUsage.outputTokens;
    acc.usageAcc.cacheReadTokens += modelUsage.cacheReadInputTokens;
    acc.usageAcc.cacheWriteTokens += modelUsage.cacheCreationInputTokens;
    acc.usageAcc.costUsd += modelUsage.costUSD;
    acc.usageAcc.webSearchRequests += modelUsage.webSearchRequests;
    // Prefer the configured cap over the model's reported capability, so provenance reflects the user's budget.
    acc.usageAcc.contextWindow = Math.max(acc.usageAcc.contextWindow, acc.ctx.configuredMaxContextTokens ?? modelUsage.contextWindow);
    acc.usageAcc.maxOutputTokens = Math.max(acc.usageAcc.maxOutputTokens, acc.ctx.configuredMaxOutputTokens ?? modelUsage.maxOutputTokens);
  }
  // The SDK types usage.cache_creation as required, but it's absent when no prompt-cache write occurred
  // (runtime-optional) — annotate as optional so the guard is honest, not "unnecessary".
  const cacheCreation = message.usage.cache_creation as Narrow<"result">["usage"]["cache_creation"] | undefined;
  if (cacheCreation !== undefined) {
    acc.usageAcc.cacheCreation5mTokens = cacheCreation.ephemeral_5m_input_tokens;
    acc.usageAcc.cacheCreation1hTokens = cacheCreation.ephemeral_1h_input_tokens;
  }
}

// Silent-downgrade detection: the SDK can route to a different billed model (overage/rate-limit fallback).
function detectModelDowngrade(acc: TurnAccumulator, message: Narrow<"result">): void {
  const canonicalize = (m: string): string => m.replace(ANTHROPIC_PREFIX_RE, "");
  const billed = Object.keys(message.modelUsage);
  const requestedCanon = canonicalize(acc.ctx.model);
  const unexpected = billed.filter((m) => canonicalize(m) !== requestedCanon);
  if (unexpected.length > 0) {
    acc.servedModel = billed[0] ?? acc.servedModel;
    logProviderDrift({ requested: acc.ctx.model, billed });
    acc.emit({ kind: "model_downgrade", at: acc.ctx.now(), requested: acc.ctx.model, billed });
  }
}

// Firewall tripwire: with the tool-less config, permission_denials must be empty; a non-empty list means a
// tool leaked past the roleplay firewall. tool_input is deliberately not surfaced (could carry content).
function checkPermissionDenials(acc: TurnAccumulator, message: Narrow<"result">): void {
  // The SDK types permission_denials as required, but the CLI omits it entirely on tool-less turns
  // (runtime-optional) — annotate as optional so the absent/empty guard is honest, not "unnecessary".
  const denials = message.permission_denials as Narrow<"result">["permission_denials"] | undefined;
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

interface ResultClassification {
  readonly classified: ReturnType<typeof classifyAssistantError>;
  readonly detail: string;
}

// Precedence, most-specific first: retry/rate-limit assistant-error code, then terminal reason, then generic subtype.
function classifyResult(acc: TurnAccumulator, message: Narrow<"result"> & { subtype: Exclude<Narrow<"result">["subtype"], "success"> }): ResultClassification {
  const rateLimited = acc.rateLimit?.status === "rejected" || acc.lastRetryError === "rate_limit";
  const specific: SDKAssistantMessageError | undefined = rateLimited ? "rate_limit" : acc.lastRetryError;
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

function buildResultError(acc: TurnAccumulator, message: Narrow<"result"> & { subtype: Exclude<Narrow<"result">["subtype"], "success"> }): ProviderError {
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
    ...(classified.kind === "rate_limit" && acc.rateLimit?.resetsAt !== undefined ? { resetsAt: acc.rateLimit.resetsAt } : {}),
  });
}

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
    // Stream-time only — handleAssistant is the canonical accumulation source, avoid double-counting.
    acc.ctx.onDelta?.({ chatId, kind: "reasoning", text: delta.thinking });
  }
  // signature_delta (mode-1's only thinking delta) carries a signature not text; falls through by design.
}
