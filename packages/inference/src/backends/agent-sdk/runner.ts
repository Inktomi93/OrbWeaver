// SDK-message-stream → `ChatResult` reducer plus chat-turn orchestration (spawn + per-chat resume).
// `consumeTurnStream` is isolated from the spawn so it's unit-testable with a hand-built stream. It speaks the
// SAME record as every other wire (§8.4-7): usage through the normalized core, `finishReason` through the shared
// fold, and the agent-sdk-only facts (the 5m/1h cache split, warm-spare, `modelUsage`, the SDK session id)
// under `providerMetadata[<providerId>]`. Cost on a subscription is `estimated` — the SDK's `costUSD` is what
// the turn WOULD have billed at API prices; no invoice exists.

import type {
  HookCallbackMatcher,
  HookEvent,
  McpSdkServerConfigWithInstance,
  Options,
  Query,
  SDKAssistantMessageError,
  SDKControlGetContextUsageResponse,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ChatUsage } from "@orb/contracts/inference";
import type { ChatId } from "@orb/kit/ids";
import { secondsToMs } from "@orb/kit/time";
import type { AgentSdkChatRequest, ChatResult, ContextUsage, ToolCallInput } from "../../contract/chat.ts";
import { normalizeFinishReason } from "../../contract/chat.ts";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { ChatEvent, RateLimitSnapshot } from "../../contract/events.ts";
import type { AgentSdkSessionId } from "../../contract/identity.ts";
import { agentSdkSessionIdSchema } from "../../contract/identity.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import { classifyHttpStatus } from "../kit/error-classify.ts";
import { redactSecretsFromText } from "../kit/openai-body.ts";
import { agentSdkVariantMetadata } from "../kit/provider-metadata.ts";
import { resolvedScrubSet, sanitizeApiError } from "../kit/sanitize.ts";
import type { AgentSdkLog } from "./log.ts";
import { toSdkOutputFormat } from "./output-schema.ts";
import type { SeededSessionDecision, SessionCache } from "./session/index.ts";
import { isTerminalToolCall, terminalToolOptions, toTerminalCall } from "./terminal-tools.ts";
import { buildSystemPrompt, disciplineOptions, hookContextOf, MCP_NAMESPACE, observabilityOptions, tailSystemOptions, toSdkGeneration } from "./translate.ts";
import type { AgentSdkDeps, TurnStreamContext } from "./types.ts";
import { assertInitFrameShape, classifyAssistantError, classifyResultSubtype, classifyTerminalReason } from "./verify.ts";

/** chatId-derived metadata label only — never the user's chat title text. */
function sdkChatTitle(chatId: ChatId | undefined): string {
  return chatId !== undefined ? `orb:${chatId}` : "orbweaver";
}
const CONTEXT_USAGE_PROBE_TIMEOUT_MS = 2000;
const ANTHROPIC_PREFIX_RE = /^anthropic\//u;
const STDERR_TAIL_CHARS = 2048;
const DEFAULT_CHAT_TOOL_ROUNDS = 4;
// A structured turn floors at 2: the runtime's own schema-validation retry consumes a turn.
const STRUCTURED_MIN_TURNS = 2;
// A TERMINAL-tool turn floors at 2 as the degrade budget: a failed stop costs a CALL, never a BEAT (D112 (2b)).
const TERMINAL_MIN_TURNS = 2;
const TRUNCATED_TERMINAL_REASON = "stream_truncated";

function chatMaxTurns(req: AgentSdkChatRequest): number {
  const toolTurns = req.toolServer !== undefined ? 1 + (req.toolTurnLimit ?? DEFAULT_CHAT_TOOL_ROUNDS) : 1;
  const structuredFloor = req.responseFormat !== undefined ? STRUCTURED_MIN_TURNS : 1;
  const terminalFloor = (req.terminalTools?.length ?? 0) > 0 ? TERMINAL_MIN_TURNS : 1;
  return Math.max(toolTurns, structuredFloor, terminalFloor);
}

/** Mount the domain's in-process MCP tool server (the STATEFUL tool channel). */
function chatToolOptions(req: AgentSdkChatRequest, turnId: string, log: AgentSdkLog): Pick<Options, "mcpServers" | "allowedTools"> | Record<string, never> {
  if (req.toolServer === undefined) {
    return {};
  }
  log.info(
    { turnId, mcpNamespace: MCP_NAMESPACE, toolTurnLimit: req.toolTurnLimit ?? DEFAULT_CHAT_TOOL_ROUNDS },
    "agent-sdk: chat turn mounts the in-process tool server",
  );
  return { mcpServers: { [MCP_NAMESPACE]: req.toolServer as McpSdkServerConfigWithInstance }, allowedTools: [`mcp__${MCP_NAMESPACE}__*`] };
}

type MountedOptions = Pick<Options, "mcpServers" | "hooks" | "allowedTools">;

/** UNION the channel fragments instead of spreading them (a spread lets the later fragment DELETE the earlier
 *  one's whole map). The per-key merge stays a SPREAD, never `Object.assign` (#1612 — `__proto__` as an own key). */
function mergeMountedOptions(...fragments: readonly Partial<MountedOptions>[]): MountedOptions {
  const merged: MountedOptions = {};
  for (const { hooks, mcpServers, allowedTools } of fragments) {
    if (mcpServers !== undefined) {
      merged.mcpServers = { ...merged.mcpServers, ...mcpServers };
    }
    if (allowedTools !== undefined) {
      merged.allowedTools = [...(merged.allowedTools ?? []), ...allowedTools];
    }
    if (hooks === undefined) {
      continue;
    }
    const acc: NonNullable<Options["hooks"]> = merged.hooks ?? {};
    for (const [event, matchers] of Object.entries(hooks) as [HookEvent, HookCallbackMatcher[] | undefined][]) {
      acc[event] = [...(acc[event] ?? []), ...(matchers ?? [])];
    }
    merged.hooks = acc;
  }
  return merged;
}

class StderrTail {
  private buf = "";
  append(chunk: string): void {
    const next = this.buf + chunk;
    this.buf = next.length > STDERR_TAIL_CHARS ? next.slice(next.length - STDERR_TAIL_CHARS) : next;
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

/** Bridge the caller's signal onto the fresh controller the SDK query takes — NOT `AbortSignal.any` (the SDK's
 *  `abortController` field takes a controller INSTANCE). */
export function linkAbort(signal: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (signal === undefined) {
    return controller;
  }
  if (signal.aborted) {
    controller.abort();
  } else {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller;
}

export async function runChatTurn(req: AgentSdkChatRequest, deps: AgentSdkDeps, sessions: SessionCache, log: AgentSdkLog): Promise<ChatResult> {
  const { connection } = req;
  if (connection.capability.kind !== "generation") {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `agent-sdk chat: the connection's model is a ${connection.capability.kind} model` });
  }
  const generation = connection.capability.generation;
  const gen = toSdkGeneration(req.params, generation);
  log.capability({
    turnId: gen.turnId,
    api: req.api,
    providerId: connection.providerId,
    requestedModel: connection.model,
    turns: { ...generation.turns },
    droppedWarnings: gen.warnings.map((w) => ({ code: w.code, message: w.message })),
  });
  const { systemPrompt, dynamicHook } = systemChannels(req);
  const { resume, disposition } = await resolveResume(req, sessions);
  logSessionDecision(req.chatId, resume, disposition, log);

  const stderrTail = new StderrTail();
  const abortController = linkAbort(req.signal);
  const chatId = req.chatId;
  const terminal = terminalToolOptions(req.terminalTools ?? [], gen.turnId, log);
  captureAgentSdkWire(req, deps, { systemPrompt, dynamicHook, resume, gen, terminalMounted: terminal !== null });
  const stream = deps.query({
    prompt: req.prompt,
    options: {
      ...disciplineOptions(deps.childEnv(connection, gen.envOverrides)),
      ...observabilityOptions(deps.debug, log),
      ...gen.options,
      ...mergeMountedOptions(dynamicHook, chatToolOptions(req, gen.turnId, log), terminal ?? {}),
      ...(req.responseFormat !== undefined ? { outputFormat: toSdkOutputFormat(req.responseFormat, connection.model) } : {}),
      includePartialMessages: req.onDelta !== undefined,
      model: connection.model,
      maxTurns: chatMaxTurns(req),
      sessionStore: sessions.store,
      stderr: (data: string): void => stderrTail.append(data),
      ...(resume !== undefined ? { resume } : {}),
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(req.signal !== undefined ? { abortController } : {}),
      title: sdkChatTitle(chatId),
    },
  });

  const result = await consumeTurnStream(
    stream,
    {
      turnId: gen.turnId,
      model: connection.model,
      providerId: connection.providerId,
      resumed: resume !== undefined,
      disposition,
      now: deps.now,
      expectStructured: req.responseFormat !== undefined,
      captureTerminalTools: terminal !== null,
      // What the runtime was TOLD (B1): thinking off is `none`; a set effort is the word; nothing set is unrecorded.
      appliedEffort: gen.options.thinking?.type === "disabled" ? "none" : (gen.options.effort ?? null),
      stderrTail: () => stderrTail.tail(),
      probeContextUsage: () => probeContextUsage(stream, deps.scheduleTimeout),
      ...(chatId !== undefined ? { chatId } : {}),
      ...(req.onEvent !== undefined ? { onEvent: req.onEvent } : {}),
      ...(req.onDelta !== undefined ? { onDelta: req.onDelta } : {}),
      ...(chatId !== undefined ? { onSessionId: (sessionId: AgentSdkSessionId): void => sessions.record(chatId, connection.connectionId, sessionId) } : {}),
      configuredMaxOutputTokens: gen.envOverrides.maxOutputTokens ?? null,
      configuredMaxContextTokens: gen.envOverrides.maxContextTokens ?? null,
      secrets: resolvedScrubSet(connection),
    },
    log,
  );
  return appendWarnings(result, gen.warnings, deps.now(), req.onEvent);
}

// Capture the SDK QUERY INPUT — the literal Anthropic body is built INSIDE the bundled subprocess. `hookContext`
// is the text the `UserPromptSubmit` hook injects beside the prompt: it is where a lifted tail system injection
// reaches the model, so a capture without it hides what the model was told.
function captureAgentSdkWire(
  req: AgentSdkChatRequest,
  deps: AgentSdkDeps,
  ctx: {
    systemPrompt: string | undefined;
    dynamicHook: Pick<Options, "hooks">;
    resume: string | undefined;
    gen: ReturnType<typeof toSdkGeneration>;
    terminalMounted: boolean;
  },
): void {
  deps.captureWire?.({
    chatId: req.chatId,
    api: req.api,
    wire: req.connection.wire,
    providerId: req.connection.providerId,
    model: req.connection.model,
    body: {
      prompt: req.prompt,
      systemPrompt: ctx.systemPrompt ?? null,
      hookContext: ctx.dynamicHook.hooks === undefined || req.tailSystem === undefined ? null : hookContextOf(req.tailSystem),
      model: req.connection.model,
      resumed: ctx.resume !== undefined,
      maxTokens: ctx.gen.envOverrides.maxOutputTokens ?? null,
      maxContextTokens: ctx.gen.envOverrides.maxContextTokens ?? null,
      disableAutoCompact: ctx.gen.envOverrides.disableAutoCompact ?? false,
      toolsMounted: req.toolServer !== undefined,
      maxTurns: chatMaxTurns(req),
      structuredOutput: req.responseFormat !== undefined,
      terminalTools: req.terminalTools?.map((t) => t.name) ?? null,
      terminalToolsMounted: ctx.terminalMounted,
    },
  });
}

/** The system-region halves join the system prompt, where the prompt order put them; the system rows below the
 *  history ride the `UserPromptSubmit` hook beside the prompt. */
function systemChannels(req: AgentSdkChatRequest): { systemPrompt: string | undefined; dynamicHook: Pick<Options, "hooks"> } {
  return { systemPrompt: buildSystemPrompt(req.systemPrompt), dynamicHook: req.tailSystem === undefined ? {} : tailSystemOptions(req.tailSystem) };
}

async function resolveResume(
  req: AgentSdkChatRequest,
  sessions: SessionCache,
): Promise<{ resume: AgentSdkSessionId | undefined; disposition: SeededSessionDecision["disposition"] }> {
  if (req.chatId === undefined) {
    return { resume: undefined, disposition: "fresh" };
  }
  if (req.seed !== undefined) {
    const decision = await sessions.ensureSeededSession(req.chatId, req.connection.connectionId, req.seed);
    return { resume: decision.sessionId ?? undefined, disposition: decision.disposition };
  }
  const recorded = sessions.resolveResumeId(req.chatId, req.connection.connectionId);
  return { resume: recorded, disposition: recorded !== undefined ? "resumed" : "fresh" };
}

function logSessionDecision(
  chatId: ChatId | undefined,
  resume: AgentSdkSessionId | undefined,
  disposition: SeededSessionDecision["disposition"],
  log: AgentSdkLog,
): void {
  if (chatId === undefined || disposition === "resumed" || disposition === "fresh") {
    return;
  }
  log.session({ chatId, sessionId: resume ?? null, disposition });
}

function appendWarnings(result: ChatResult, warnings: readonly ResolvedWarning[], at: number, onEvent: ((event: ChatEvent) => void) | undefined): ChatResult {
  if (warnings.length === 0) {
    return result;
  }
  const events = warnings.map((warning): ChatEvent => ({ kind: "warning", at, ...warning }));
  for (const event of events) {
    onEvent?.(event);
  }
  return { ...result, events: [...result.events, ...events] };
}

function toContextUsage(res: SDKControlGetContextUsageResponse): ContextUsage {
  return { totalTokens: res.totalTokens, maxTokens: res.maxTokens, percentage: res.percentage, model: res.model };
}

/** Bounded, non-fatal context-fill probe; a throw/rejection/timeout all resolve `undefined`. */
async function probeContextUsage(query: Query, scheduleTimeout: AgentSdkDeps["scheduleTimeout"]): Promise<ContextUsage | undefined> {
  if (typeof query.getContextUsage !== "function") {
    return;
  }
  let cancelTimer: (() => void) | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    cancelTimer = scheduleTimeout(() => resolve(undefined), CONTEXT_USAGE_PROBE_TIMEOUT_MS);
  });
  let usage: ContextUsage | undefined;
  try {
    const res = await Promise.race([query.getContextUsage(), timeout]);
    usage = res !== undefined ? toContextUsage(res) : undefined;
    // @orb-waive caught-failure-ownership(catch): context fill is an optional bounded diagnostic and `undefined` omits only that sidecar. Precedent: packages/client/src/lib/perf-marks.ts accepts the same best-effort diagnostic loss. Ends if the probe starts governing the turn result.
  } catch {
    // diagnostic miss, not a turn failure
  } finally {
    cancelTimer?.();
  }
  return usage;
}

/** Reduce an SDK message stream into a `ChatResult`; throws `ProviderError` on any failure result. A stream
 *  that ends without a `result` frame is a TRUNCATED turn and a retryable provider fault (#1400). */
export async function consumeTurnStream(stream: AsyncIterable<SDKMessage>, ctx: TurnStreamContext, log: AgentSdkLog): Promise<ChatResult> {
  const acc = new TurnAccumulator(ctx, log);
  try {
    for await (const message of stream) {
      if (typeof message.session_id === "string" && message.session_id.length > 0) {
        acc.observeSessionId(agentSdkSessionIdSchema.parse(message.session_id));
      }
      dispatch(acc, message);
    }
  } catch (error) {
    return acc.finishWithError(error);
  }
  if (!acc.sawTerminalFrame) {
    return acc.finishWithError(
      new ProviderError({
        kind: "server",
        retryable: true,
        message: "agent-sdk: the message stream ended without a result frame (truncated turn)",
        model: ctx.model,
        terminalReason: TRUNCATED_TERMINAL_REASON,
        ...(acc.errorSessionId !== undefined ? { sessionId: acc.errorSessionId } : {}),
      }),
    );
  }
  return acc.finish(await runContextUsageProbe(ctx.probeContextUsage));
}

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
      acc.log.debug({ messageType: message.type }, "agent-sdk: unhandled sdk message type");
      break;
  }
}

type Narrow<K extends SDKMessage["type"]> = Extract<SDKMessage, { type: K }>;

/** The normalized-core half the `result` frame fills. ABSENCE IS NULL, NEVER ZERO on the billed axes. */
interface UsageAcc {
  tokensIn: number | null;
  tokensOut: number | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  costUsd: number | null;
}

/** The agent-sdk-only facts that ride `providerMetadata[<providerId>]` (§8.4-7). */
interface SdkMetadata {
  cacheCreation5mTokens: number | null;
  cacheCreation1hTokens: number | null;
  webSearchRequests: number;
  warmSpareClaimed: boolean | null;
  modelUsage: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
  sdkSessionId: string | null;
  apiKeySource: string | null;
  servedModel: string | null;
}

/** Owns all turn-local state; `finish()`/`finishWithError()` are the only exits. */
class TurnAccumulator {
  reply = "";
  structuredOutput: unknown;
  reasoning = "";
  sessionId: AgentSdkSessionId | null = null;
  stopReason: string | null = null;
  terminalReason: string | null = null;
  private terminalFrames = 0;
  ttftMs: number | null = null;
  durationApiMs: number | null = null;
  apiErrorStatus: number | null = null;
  numTurns = 0;
  rateLimit: RateLimitSnapshot | null = null;
  reasoningTokens: number | null = null;
  redactedThinkingBlocks = 0;
  lastRetryError: SDKAssistantMessageError | undefined;
  /** The code on the runtime's synthetic API-error assistant frame, and the upstream request id it names. */
  assistantError: SDKAssistantMessageError | undefined;
  requestId: string | undefined;
  /** The operator label of a failed result, for the `provider.error` line (the message carries runtime text). */
  failureLabel: string | undefined;
  readonly terminalToolCalls: ToolCallInput[] = [];
  readonly events: ChatEvent[] = [];
  readonly usageAcc: UsageAcc = {
    tokensIn: null,
    tokensOut: null,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    contextWindow: null,
    maxOutputTokens: null,
    costUsd: null,
  };
  readonly meta: SdkMetadata = {
    cacheCreation5mTokens: null,
    cacheCreation1hTokens: null,
    webSearchRequests: 0,
    warmSpareClaimed: null,
    modelUsage: {},
    sdkSessionId: null,
    apiKeySource: null,
    servedModel: null,
  };
  readonly startedAt: number;
  readonly ctx: TurnStreamContext;
  readonly log: AgentSdkLog;

  constructor(ctx: TurnStreamContext, log: AgentSdkLog) {
    this.ctx = ctx;
    this.log = log;
    this.startedAt = ctx.now();
  }

  private buildUsage(): ChatUsage {
    return {
      model: this.ctx.model,
      ...this.usageAcc,
      reasoningTokens: this.reasoningTokens,
      costDetails: null,
      // A subscription's SDK-computed price is notional — no invoice exists (§8.4-7 (a)).
      costProvenance: this.usageAcc.costUsd !== null ? "estimated" : "unrecorded",
    };
  }

  markTerminalFrame(): void {
    this.terminalFrames += 1;
  }

  get sawTerminalFrame(): boolean {
    return this.terminalFrames > 0;
  }

  observeSessionId(id: AgentSdkSessionId): void {
    const firstSighting = this.sessionId === null;
    this.sessionId = id;
    this.meta.sdkSessionId = id;
    if (firstSighting) {
      this.ctx.onSessionId?.(id);
    }
  }

  emit(event: ChatEvent): void {
    this.events.push(event);
    this.ctx.onEvent?.(event);
  }

  private logTurn(ok: boolean, contextUsage?: ContextUsage): void {
    this.log.turn({
      ...(this.ctx.turnId !== undefined ? { turnId: this.ctx.turnId } : {}),
      ...(this.ctx.chatId !== undefined ? { chatId: this.ctx.chatId } : {}),
      ...(this.sessionId !== null ? { sessionId: this.sessionId } : {}),
      ...(this.meta.apiKeySource !== null ? { apiKeySource: this.meta.apiKeySource } : {}),
      requestedModel: this.ctx.model,
      ...(this.meta.servedModel !== null ? { servedModel: this.meta.servedModel } : {}),
      ...(this.ctx.disposition !== undefined ? { disposition: this.ctx.disposition } : {}),
      terminalReason: this.terminalReason,
      numTurns: this.numTurns,
      durationMs: this.ctx.now() - this.startedAt,
      ttftMs: this.ttftMs,
      ok,
      ...(contextUsage !== undefined ? { contextUsage } : {}),
      usage: {
        ...(this.usageAcc.tokensIn !== null ? { tokensIn: this.usageAcc.tokensIn } : {}),
        ...(this.usageAcc.tokensOut !== null ? { tokensOut: this.usageAcc.tokensOut } : {}),
        reasoningTokens: this.reasoningTokens,
        cacheReadTokens: this.usageAcc.cacheReadTokens,
        cacheWriteTokens: this.usageAcc.cacheWriteTokens,
        ...(this.usageAcc.costUsd !== null ? { costUsd: this.usageAcc.costUsd } : {}),
      },
    });
  }

  finish(contextUsage?: ContextUsage): ChatResult {
    this.logTurn(true, contextUsage);
    const structuredReply = this.ctx.expectStructured === true && this.structuredOutput !== undefined ? JSON.stringify(this.structuredOutput) : undefined;
    // The subscription's own receipts, narrowed to the closed per-provider sidecar the variant stores
    // (`backends/kit/provider-metadata.ts`). `modelUsage` and `apiKeySource` stay OUT of the record on purpose:
    // the first is a per-model breakdown the stats plane already rolls up from the variant rows themselves, the
    // second is a turn-LOG canary (sub vs key) with no meaning on a stored generation.
    const providerMetadata = agentSdkVariantMetadata(this.ctx.providerId, {
      cacheCreation5mTokens: this.meta.cacheCreation5mTokens,
      cacheCreation1hTokens: this.meta.cacheCreation1hTokens,
      webSearchRequests: this.meta.webSearchRequests,
      warmSpareClaimed: this.meta.warmSpareClaimed,
      sdkSessionId: this.meta.sdkSessionId,
      servedModel: this.meta.servedModel,
      durationApiMs: this.durationApiMs,
      numTurns: this.numTurns,
    });
    return {
      reply: structuredReply ?? this.reply.trim(),
      ...(this.ctx.captureTerminalTools === true ? { toolCalls: this.terminalToolCalls } : {}),
      reasoning: this.reasoning,
      reasoningRedacted: this.redactedThinkingBlocks > 0,
      stopReason: this.stopReason,
      terminalReason: this.terminalReason,
      finishReason: normalizeFinishReason(this.stopReason ?? this.terminalReason),
      ttftMs: this.ttftMs,
      durationApiMs: this.durationApiMs,
      apiErrorStatus: this.apiErrorStatus,
      numTurns: this.numTurns,
      generationId: null,
      appliedEffort: this.ctx.appliedEffort,
      ...(contextUsage !== undefined ? { contextUsage } : {}),
      usage: this.buildUsage(),
      ...(providerMetadata !== undefined ? { providerMetadata } : {}),
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
    const spawnDeath = perr.kind === "server" || perr.kind === "unknown";
    const tail = spawnDeath ? this.ctx.stderrTail?.() : undefined;
    this.log.error(perr, {
      ...(tail !== undefined && tail.length > 0 ? { stderrTail: tail } : {}),
      ...(this.failureLabel !== undefined ? { label: this.failureLabel } : {}),
    });
    return perr;
  }

  get errorSessionId(): AgentSdkSessionId | undefined {
    return this.sessionId ?? undefined;
  }

  private toProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }
    const sessionId = this.errorSessionId;
    const kind = isAbortError(error) ? "aborted" : "server";
    return new ProviderError({
      kind,
      retryable: kind === "server",
      message: messageOf(error),
      model: this.ctx.model,
      ...(sessionId !== undefined ? { sessionId } : {}),
      cause: error,
    });
  }
}

function handleAssistant(acc: TurnAccumulator, message: Narrow<"assistant">): void {
  acc.stopReason = message.message.stop_reason ?? acc.stopReason;
  // The code belongs to the model call this frame reports: a later clean frame clears an earlier leg's code,
  // so only the synthetic error frame that immediately precedes a failed result can classify it.
  acc.assistantError = message.error;
  acc.requestId = message.request_id ?? acc.requestId;
  for (const block of message.message.content) {
    if (block.type === "text") {
      acc.reply += block.text;
    } else if (block.type === "tool_use") {
      captureTerminalCall(acc, block);
    } else if (block.type === "thinking") {
      acc.reasoning += block.thinking;
    } else if (block.type === "redacted_thinking") {
      acc.redactedThinkingBlocks += 1;
    }
  }
}

function captureTerminalCall(acc: TurnAccumulator, block: { readonly id: string; readonly name: string; readonly input: unknown }): void {
  if (acc.ctx.captureTerminalTools !== true) {
    return;
  }
  const call = toTerminalCall(block);
  if (call !== null) {
    acc.terminalToolCalls.push(call);
  }
}

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
    acc.meta.apiKeySource = message.apiKeySource;
    acc.meta.servedModel = message.model;
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
  acc.log.refusal({ category: message.api_refusal_category ?? null, retried });
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
  acc.log.info({ trigger: meta.trigger, preTokens: meta.pre_tokens, postTokens: meta.post_tokens }, "agent-sdk: context compacted");
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
  acc.log.retry({
    attempt: message.attempt,
    maxRetries: message.max_retries,
    errorStatus: message.error_status,
    sdkError: message.error,
    kind: cls.kind,
    authFailure: cls.kind === "auth_failed",
  });
  // Fail-fast: the runtime sometimes retries a non-retryable failure with exponential backoff.
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
  acc.emit({ kind: "status", at: acc.ctx.now(), status: message.status ?? "unknown", compactResult: message.compact_result });
  if (message.compact_result === "failed") {
    acc.log.compaction({ compactError: message.compact_error });
  }
}

function handleRateLimitEvent(acc: TurnAccumulator, message: Narrow<"rate_limit_event">): void {
  const info = message.rate_limit_info;
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
  const banRisk = !(info.status === "allowed" && isUsingOverage !== true);
  acc.log.rateLimit(banRisk, {
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

function handleAuthStatus(acc: TurnAccumulator, message: Narrow<"auth_status">): void {
  acc.emit({ kind: "auth_status", at: acc.ctx.now(), isAuthenticating: message.isAuthenticating, error: message.error });
  acc.log.warn({ isAuthenticating: message.isAuthenticating, authError: message.error }, "agent-sdk: auth status change");
}

function accumulateUsage(acc: TurnAccumulator, message: Narrow<"result">): void {
  for (const [model, modelUsage] of Object.entries(message.modelUsage)) {
    acc.usageAcc.tokensIn = (acc.usageAcc.tokensIn ?? 0) + modelUsage.inputTokens;
    acc.usageAcc.tokensOut = (acc.usageAcc.tokensOut ?? 0) + modelUsage.outputTokens;
    acc.usageAcc.cacheReadTokens += modelUsage.cacheReadInputTokens;
    acc.usageAcc.cacheWriteTokens += modelUsage.cacheCreationInputTokens;
    acc.usageAcc.costUsd = (acc.usageAcc.costUsd ?? 0) + modelUsage.costUSD;
    acc.meta.webSearchRequests += modelUsage.webSearchRequests;
    acc.meta.modelUsage[model] = { inputTokens: modelUsage.inputTokens, outputTokens: modelUsage.outputTokens, costUsd: modelUsage.costUSD };
    acc.usageAcc.contextWindow = Math.max(acc.usageAcc.contextWindow ?? 0, acc.ctx.configuredMaxContextTokens ?? modelUsage.contextWindow);
    acc.usageAcc.maxOutputTokens = Math.max(acc.usageAcc.maxOutputTokens ?? 0, acc.ctx.configuredMaxOutputTokens ?? modelUsage.maxOutputTokens);
  }
  // The SDK types `usage.cache_creation` as required, but it's absent when no prompt-cache write occurred —
  // read through a Partial view so the absence is a typed fact, not a dead guard.
  const usage: Partial<Narrow<"result">["usage"]> = message.usage;
  const cacheCreation = usage.cache_creation;
  if (cacheCreation !== undefined) {
    acc.meta.cacheCreation5mTokens = cacheCreation.ephemeral_5m_input_tokens;
    acc.meta.cacheCreation1hTokens = cacheCreation.ephemeral_1h_input_tokens;
  }
}

function detectModelDowngrade(acc: TurnAccumulator, message: Narrow<"result">): void {
  const canonicalize = (m: string): string => m.replace(ANTHROPIC_PREFIX_RE, "");
  const billed = Object.keys(message.modelUsage);
  const requestedCanon = canonicalize(acc.ctx.model);
  const unexpected = billed.filter((m) => canonicalize(m) !== requestedCanon);
  if (unexpected.length > 0) {
    acc.meta.servedModel = billed[0] ?? acc.meta.servedModel;
    acc.log.drift({ requested: acc.ctx.model, billed });
    acc.emit({ kind: "model_downgrade", at: acc.ctx.now(), requested: acc.ctx.model, billed });
  }
}

// Firewall tripwire: with the tool-less config, permission_denials must be empty (a terminal tool's denial is
// the MECHANISM, not a leak, and is exempted).
function checkPermissionDenials(acc: TurnAccumulator, message: Narrow<"result">): void {
  // Typed required by the SDK, absent on the wire for a tool-less turn — same Partial view as `usage`.
  const result: Partial<Pick<Narrow<"result">, "permission_denials">> = message;
  const denials = result.permission_denials;
  if (denials === undefined || denials.length === 0) {
    return;
  }
  const toolNames = denials.map((d) => d.tool_name).filter((name) => !isTerminalToolCall(name));
  if (toolNames.length === 0) {
    return;
  }
  acc.emit({ kind: "permission_leak", at: acc.ctx.now(), toolNames });
  acc.log.leak({ model: acc.ctx.model, toolNames });
}

function handleResult(acc: TurnAccumulator, message: Narrow<"result">): void {
  acc.markTerminalFrame();
  acc.numTurns = message.num_turns;
  acc.terminalReason = message.terminal_reason ?? null;
  acc.stopReason = message.stop_reason ?? acc.stopReason;
  accumulateUsage(acc, message);
  detectModelDowngrade(acc, message);
  checkPermissionDenials(acc, message);
  if (message.subtype === "success") {
    acc.structuredOutput = message.structured_output;
    acc.ttftMs = message.ttft_ms ?? null;
    acc.durationApiMs = message.duration_api_ms;
    acc.apiErrorStatus = message.api_error_status ?? null;
    acc.meta.warmSpareClaimed = message.warm_spare_claimed ?? null;
    if (!message.is_error) {
      return;
    }
  }
  throw buildResultError(acc, message);
}

// Classify a failed turn, most specific evidence first. A `success` result flagged `is_error` is the runtime's
// synthetic API-error turn (a model its CLI version cannot serve, a model that does not exist): the assistant
// frame before it names the SDK error code, and the result carries the upstream HTTP status. `unknown` is the
// code the runtime stamps when it has no better word, so the status outranks it.
function classifyResult(
  acc: TurnAccumulator,
  message: Narrow<"result">,
): { readonly classified: ReturnType<typeof classifyAssistantError>; readonly detail: string } {
  const rateLimited = acc.rateLimit?.status === "rejected" || acc.lastRetryError === "rate_limit";
  const specific: SDKAssistantMessageError | undefined = rateLimited ? "rate_limit" : (acc.assistantError ?? acc.lastRetryError);
  if (specific !== undefined && specific !== "unknown") {
    return { classified: classifyAssistantError(specific), detail: specific };
  }
  const status = message.subtype === "success" ? message.api_error_status : undefined;
  if (typeof status === "number") {
    return { classified: classifyHttpStatus(status), detail: `http_${status}` };
  }
  if (message.terminal_reason !== undefined) {
    return { classified: classifyTerminalReason(message.terminal_reason), detail: message.terminal_reason };
  }
  if (message.subtype === "success") {
    return { classified: { kind: "server", retryable: true }, detail: "is_error" };
  }
  return { classified: classifyResultSubtype(message.subtype), detail: message.subtype };
}

/** The runtime's own words for the failure: the error result's `errors`, or the flagged success's `result`
 *  text. `invalid` carries its message to the user, so this explains a rejected model — and, being upstream
 *  prose, it is scrubbed of this spawn's credential literals and then sanitized, in that order
 *  (`transport/trpc/error-mapping.ts`, "THE ONE KIND THAT DOES"). The same message reaches the auth_failed
 *  revoke audit row. */
function failureText(message: Narrow<"result">, secrets: ProviderScrubSet): string {
  const parts = message.subtype === "success" ? [message.result] : message.errors;
  return sanitizeApiError(redactSecretsFromText(parts.filter((part) => part.length > 0).join("; "), secrets));
}

function buildResultError(acc: TurnAccumulator, message: Narrow<"result">): ProviderError {
  const { classified, detail } = classifyResult(acc, message);
  const status = message.subtype === "success" ? message.api_error_status : undefined;
  // The label is operator vocabulary: it rides the `provider.error` log line, never the user's message.
  const label = `agent-sdk: turn failed (${message.subtype === "success" ? detail : message.subtype})`;
  acc.failureLabel = label;
  const text = failureText(message, acc.ctx.secrets);
  return new ProviderError({
    kind: classified.kind,
    retryable: classified.retryable,
    message: text.length > 0 ? text : label,
    model: acc.ctx.model,
    detail,
    ...(acc.errorSessionId !== undefined ? { sessionId: acc.errorSessionId } : {}),
    ...(message.terminal_reason !== undefined ? { terminalReason: message.terminal_reason } : {}),
    ...(typeof status === "number" ? { apiErrorStatus: status } : {}),
    ...(acc.requestId !== undefined ? { requestId: acc.requestId } : {}),
    ...(classified.kind === "rate_limit" && acc.rateLimit?.resetsAt !== undefined ? { resetsAt: acc.rateLimit.resetsAt } : {}),
  });
}

function handleStreamEvent(acc: TurnAccumulator, message: Narrow<"stream_event">): void {
  const raw = message.event;
  if (raw.type !== "content_block_delta") {
    return;
  }
  const delta = raw.delta;
  const { chatId, onDelta } = acc.ctx;
  if (chatId === undefined || onDelta === undefined) {
    return;
  }
  if (delta.type === "text_delta") {
    onDelta({ chatId, kind: "text", text: delta.text });
    return;
  }
  if (delta.type === "thinking_delta") {
    // Stream-time only — handleAssistant is the canonical accumulation source.
    onDelta({ chatId, kind: "reasoning", text: delta.thinking });
  }
}
