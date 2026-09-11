// SDK-message-stream → {@link ChatResult} reducer plus chat-turn orchestration (spawn + per-chat resume).
// `consumeTurnStream` is isolated from the spawn so it's unit-testable with a hand-built stream.

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
  ToolCallInput,
} from "../../contract/index.ts";
import { normalizeFinishReason, ProviderError } from "../../contract/index.ts";
import { resolveDynamicContext } from "../../resolve-chat.ts";
import { refreshHostSubTokenIfMode1 } from "./host-token.ts";
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
} from "./log.ts";
import { toSdkOutputFormat } from "./output-schema.ts";
import type { SeededSessionDecision, SessionCache } from "./session/index.ts";
import { isTerminalToolCall, terminalToolOptions, toTerminalCall } from "./terminal-tools.ts";
import { buildSystemPrompt, disciplineOptions, dynamicContextOptions, MCP_NAMESPACE, observabilityOptions, toSdkGeneration } from "./translate.ts";
import type { AgentSdkDeps, TurnStreamContext } from "./types.ts";
import { assertInitFrameShape, classifyAssistantError, classifyResultSubtype, classifyTerminalReason } from "./verify.ts";

/** chatId-derived metadata label only — never the user's chat title text (RP content stays out of the SDK's transcript store). */
function sdkChatTitle(chatId: ChatId | undefined): string {
  return chatId !== undefined ? `orb:${chatId}` : "orbweaver";
}
const CONTEXT_USAGE_PROBE_TIMEOUT_MS = 2000;
const ANTHROPIC_PREFIX_RE = /^anthropic\//;
/** The stderr tail bound, in UTF-16 CODE UNITS — the unit `buf.length` actually counts, and the unit a
 *  retained JS string actually costs. The former `_BYTES` spelling named a quantity this code never measures
 *  (a multi-byte character costs one unit here and up to four bytes on the wire); no behaviour change. */
const STDERR_TAIL_CHARS = 2048;
// Tool-loop round fallback when the caller mounts a tool server without a limit (the pipeline always sets one).
const DEFAULT_CHAT_TOOL_ROUNDS = 4;
// A structured turn floors at 2: the runtime's own schema-validation retry consumes a turn (agent-runner parity).
const STRUCTURED_MIN_TURNS = 2;
// A TERMINAL-tool turn floors at 2 — NOT because a second turn is wanted (the PreToolUse deny ends the turn at
// depth 0, which is the whole point), but as the degrade budget: if that stop ever failed, a ceiling of 1 would
// make the runtime answer `error_max_turns` and take the NARRATIVE down with it. At 2 the same failure costs one
// extra call and the reply still lands — a failed mechanism costs a CALL, never a BEAT (D112 (2b)).
const TERMINAL_MIN_TURNS = 2;

/** The chat turn's SDK turn ceiling: 1 for the plain roleplay turn (the firewall base); a mounted tool
 *  server lifts it to rounds + the final reply (the SDK owns the loop); structured + terminal turns floor at 2. */
function chatMaxTurns(req: AgentSdkChatRequest): number {
  const toolTurns = req.toolServer !== undefined ? 1 + (req.toolTurnLimit ?? DEFAULT_CHAT_TOOL_ROUNDS) : 1;
  const structuredFloor = req.responseFormat !== undefined ? STRUCTURED_MIN_TURNS : 1;
  const terminalFloor = (req.terminalTools?.length ?? 0) > 0 ? TERMINAL_MIN_TURNS : 1;
  return Math.max(toolTurns, structuredFloor, terminalFloor);
}

/** Mount the domain's in-process MCP tool server (the STATEFUL tool channel) — overrides the firewall
 *  base's `mcpServers:{}` (spread AFTER discipline); the cowork denylist (`disallowedTools`) still holds,
 *  and the `permission_leak` tripwire stays armed for anything outside the namespaced allowlist. Logged so
 *  a tool-riding turn is never silent. */
function chatToolOptions(req: AgentSdkChatRequest, turnId: string): Pick<Options, "mcpServers" | "allowedTools"> | Record<string, never> {
  if (req.toolServer === undefined) {
    return {};
  }
  getLog().info(
    { turnId, mcpNamespace: MCP_NAMESPACE, toolTurnLimit: req.toolTurnLimit ?? DEFAULT_CHAT_TOOL_ROUNDS },
    "agent-sdk: chat turn mounts the in-process tool server",
  );
  return {
    mcpServers: { [MCP_NAMESPACE]: req.toolServer as McpSdkServerConfigWithInstance },
    allowedTools: [`mcp__${MCP_NAMESPACE}__*`],
  };
}

/** The SDK option fields more than one channel contributes: the two MCP mounts (registry + terminal), the
 *  registry mount's allowlist, and the two hook channels (dynamic-context UserPromptSubmit + terminal
 *  PreToolUse). */
type MountedOptions = Pick<Options, "mcpServers" | "hooks" | "allowedTools">;

/** UNION the channel fragments instead of spreading them: a plain spread lets the later fragment DELETE the
 *  earlier one's whole `mcpServers`/`hooks` map — which would silently drop the mid-conversation system channel
 *  (or a whole tool mount) on any turn that carries both. Per-event hook matcher lists concatenate.
 *
 *  THE PER-KEY MERGE STAYS A SPREAD, NEVER `Object.assign` (#1612 — the constraint's home is
 *  `agent-runner.ts::toSdkExternalServers`): a mount name is caller-supplied on the agent path, so the record
 *  can hold `__proto__` as an OWN property, and only a spread copies it — `Object.assign` routes it through the
 *  prototype setter and the entry vanishes with nothing red. No chat-side fragment is caller-keyed TODAY, which
 *  is why this is a mechanism pin rather than a live hole; a future caller-keyed fragment inherits the rule.
 *
 *  Exported for that unit pin only — not a composition surface. */
export function mergeMountedOptions(...fragments: readonly Partial<MountedOptions>[]): MountedOptions {
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

/** Bounded last-N-code-units tail of the CLI subprocess stderr for one turn. */
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

/** Bridge the caller's signal onto the fresh controller the SDK query takes — an ALREADY-aborted caller
 *  aborts it immediately (an `addEventListener` alone would never fire and the turn would run on).
 *
 *  NOT `AbortSignal.any` (Node-26 program §4.12, deliberate KEEP): the SDK's `options.abortController` field
 *  takes an AbortController INSTANCE, not a signal, so there is nothing for a composite signal to be handed
 *  to. The same forward is spelled inline in `verify-auth`/`summarize`/`agent-runner` for the same reason. */
function linkAbort(signal: AbortSignal | undefined): AbortController {
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
  const abortController = linkAbort(req.signal);

  const chatId = req.chatId;
  // The TERMINAL channel (D112 R1): its own MCP mount + the PreToolUse deny-and-stop hook, or `null` when
  // nothing was requested / a schema would not lift. `null` means the request stays byte-identical to a
  // tool-less one AND `toolCalls` stays absent, so the fold reads its honest "no channel" and runs its round.
  const terminal = terminalToolOptions(req.terminalTools ?? [], gen.turnId);
  captureAgentSdkWire(req, deps, { systemPrompt, resume, gen, terminalMounted: terminal !== null });
  const stream = deps.query({
    prompt: req.prompt,
    options: {
      ...disciplineOptions(req.credential, req.orSkinTierModels, gen.envOverrides),
      ...observabilityOptions(),
      ...gen.options,
      // The stateful tool + structured + terminal channels (all absent on a plain roleplay turn —
      // byte-identical): the MCP mounts override the firewall base's mcpServers:{}; outputFormat is the SDK's
      // own json_schema mode (bound-stripped, agent-runner parity) — honored on every skin. The two mounts and
      // the two hook channels MERGE (a spread would drop one), so a folded turn keeps its dynamic-context hook.
      ...mergeMountedOptions(dynamicHook, chatToolOptions(req, gen.turnId), terminal ?? {}),
      ...(req.responseFormat !== undefined ? { outputFormat: toSdkOutputFormat(req.responseFormat, req.model) } : {}),
      includePartialMessages: req.onDelta !== undefined,
      model: req.model,
      maxTurns: chatMaxTurns(req),
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
    expectStructured: req.responseFormat !== undefined,
    captureTerminalTools: terminal !== null,
    stderrTail: () => stderrTail.tail(),
    probeContextUsage: () => probeContextUsage(stream),
    ...(chatId !== undefined ? { chatId } : {}),
    ...(req.onEvent !== undefined ? { onEvent: req.onEvent } : {}),
    ...(req.onDelta !== undefined ? { onDelta: req.onDelta } : {}),
    // @orb-waive brand-in-name-position(sessionId): the Claude Agent SDK's OWN chat-session id (its `session_id` wire field) — a NAME COLLISION with our BFF `SessionId = TypeIdOf<"session">`, a different wire's id that merely shares the spelling. Ends if this position ever carries one of our session rows, or if the field is renamed `sdkSessionId` (which would dissolve this marker).
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
  ctx: {
    systemPrompt: string | string[] | undefined;
    resume: string | undefined;
    gen: ReturnType<typeof toSdkGeneration>;
    terminalMounted: boolean;
  },
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
      // The stateful tool/structured channels — captured so a tool-mounting or structured turn is
      // observable in the wire record (the visibility floor: nothing rides silently).
      toolsMounted: req.toolServer !== undefined,
      maxTurns: chatMaxTurns(req),
      structuredOutput: req.responseFormat !== undefined,
      // The TERMINAL channel: the tool NAMES declared (never their per-game schemas — those carry actor
      // names) plus whether the mount actually happened, so a folded turn that degraded is visible here too.
      terminalTools: req.terminalTools?.map((t) => t.name) ?? null,
      terminalToolsMounted: ctx.terminalMounted,
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
  dynamicHook: Pick<Options, "hooks">;
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

function logSessionDecision(chatId: ChatId | undefined, resume: string | undefined, disposition: SeededSessionDecision["disposition"]): void {
  if (chatId === undefined || disposition === "resumed" || disposition === "fresh") {
    return;
  }
  logProviderSession({ chatId, sessionId: resume ?? null, disposition });
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
  // @orb-waive caught-failure-ownership(catch): a bounded context-fill probe collapses any throw/timeout to undefined (usage absent); purely diagnostic, gates no turn/auth decision. Ends if context usage ever gates a turn.
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

/** Reduce an SDK message stream into a {@link ChatResult}; throws {@link ProviderError} on any failure result.
 *
 *  TRUNCATION FAILS CLOSED (#1400). A `result` frame is the SDK's turn terminal — every completed turn emits
 *  one, and `handleResult` is the ONLY writer of `numTurns`/`terminalReason`/the usage fold. A transport or
 *  subprocess that emits assistant deltas and then simply ENDS produced no terminal, and reducing that into a
 *  `finish()` returned a normal success carrying a PARTIAL reply (`numTurns:0`, `stopReason:null`) which the
 *  engine commits as a completed turn — canon corruption indistinguishable from a short reply. So a stream
 *  that ends without a terminal frame is a retryable provider fault, matching what the sibling summarize
 *  reducer has always done with a missing result (`summarize.ts` — "no result frame"). */
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

/** The `terminalReason` a truncated (terminal-frame-less) stream is classified under — a provider-faithful
 *  string like every other terminal reason, so `/api/_debug/wire/outcomes` can tell this apart from a real
 *  upstream terminal the backend named. */
const TRUNCATED_TERMINAL_REASON = "stream_truncated";

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

/** The mutable accumulator for the `result`-frame half of {@link ChatUsage} — DERIVED from the contract
 *  (never re-spelled), minus the four fields the accumulator does not fold: `model` + `reasoningTokens`
 *  come from the turn context / `thinking_tokens` frames, and `costDetails`/`isByok` are OpenRouter-only. */
type MutableChatUsageAcc = {
  -readonly [K in keyof Omit<ChatUsage, "model" | "reasoningTokens" | "costDetails" | "isByok">]: ChatUsage[K];
};

/** Owns all turn-local state; `finish()`/`finishWithError()` are the only exits. */
class TurnAccumulator {
  reply = "";
  // The success frame's `structured_output` — surfaced as the reply when the request mounted an
  // outputFormat (ctx.expectStructured); undefined otherwise.
  structuredOutput: unknown;
  // Accumulated ONLY from the final assistant message — the thinking_delta stream path is UI-only, not re-accumulated here.
  reasoning = "";
  sessionId = "";
  stopReason: string | null = null;
  terminalReason: string | null = null;
  /** How many `result` frames — the SDK's turn terminal — this stream carried (#1400). A COUNTER rather than a
   *  boolean flag so the read below is a computed `boolean`: an `= false` field initializer makes biome's type
   *  service narrow every later read to the literal `false` and call the truncation check unreachable. */
  private terminalFrames = 0;
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
  /** The TERMINAL tool calls this completion co-emitted (D112 R1) — read off the assistant frame's `tool_use`
   *  blocks BEFORE the permission seam denies them, which is why they are complete even though the deny hook
   *  ends the turn on the first one. Collected only when the terminal channel actually mounted. */
  readonly terminalToolCalls: ToolCallInput[] = [];
  readonly events: ChatEvent[] = [];
  /** ABSENCE IS NULL, NEVER ZERO. Every axis the SDK only reports through a `result` frame starts null and
   *  becomes a number the first time a `modelUsage` entry (or the optional `usage.cache_creation` frame)
   *  is folded — a turn whose result carried an EMPTY `modelUsage` therefore reports nothing at all.
   *  A fabricated 0 would be stamped `measured` by `canon-write.ts::variantEconomics` (0 !== null) and
   *  counted as a real cost sample by the stats rollups. This is the same null-absence contract the other
   *  three mappers state with `?? null`: `backends/kit/openai-compat/stream.ts::mapUsage`,
   *  `backends/openrouter/runners/chat/responses.ts::mapResponsesUsage`, and this backend's own
   *  `summarize.ts::reduceSummarizeStream`. The three counters that stay plain numbers are the contract's
   *  non-nullable ones — 0 IS the honest "no cache read / no cache write / no web search". */
  readonly usageAcc: MutableChatUsageAcc = {
    tokensIn: null,
    tokensOut: null,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheCreation5mTokens: null,
    cacheCreation1hTokens: null,
    contextWindow: null,
    maxOutputTokens: null,
    webSearchRequests: 0,
    costUsd: null,
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

  /** A `result` frame arrived — see {@link terminalFrames}. */
  markTerminalFrame(): void {
    this.terminalFrames += 1;
  }

  /** Did this stream reach its terminal? False ⇒ the transport ended mid-turn (#1400). */
  get sawTerminalFrame(): boolean {
    return this.terminalFrames > 0;
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
      // The denominator for `usage.tokensOut` below (a SUM across the loop's calls, not one completion).
      numTurns: this.numTurns,
      durationMs: this.ctx.now() - this.startedAt,
      ttftMs: this.ttftMs,
      ok,
      ...(contextUsage !== undefined ? { contextUsage } : {}),
      // `ProviderTurnUsage`'s fields are OPTIONAL precisely so "a turn that never reached a result frame
      // still logs a coherent line" — an unbilled axis is OMITTED here, never logged as a measured 0.
      usage: {
        ...(this.usageAcc.tokensIn !== null ? { tokensIn: this.usageAcc.tokensIn } : {}),
        ...(this.usageAcc.tokensOut !== null ? { tokensOut: this.usageAcc.tokensOut } : {}),
        reasoningTokens: this.reasoningTokens,
        cacheReadTokens: this.usageAcc.cacheReadTokens,
        cacheWriteTokens: this.usageAcc.cacheWriteTokens,
        ...(this.usageAcc.costUsd !== null ? { costUsd: this.usageAcc.costUsd } : {}),
        warmSpareClaimed: this.warmSpareClaimed,
      },
    });
  }

  finish(contextUsage?: ContextUsage): ChatResult {
    this.logTurn(true, contextUsage);
    // Structured turns reply with the validated structured_output as compact JSON (the vLLM
    // guided-decoding convention); absent structured_output on a structured turn falls back to the
    // assistant text (the caller's schema parse is the belt that catches a non-conforming turn).
    const structuredReply = this.ctx.expectStructured === true && this.structuredOutput !== undefined ? JSON.stringify(this.structuredOutput) : undefined;
    return {
      reply: structuredReply ?? this.reply.trim(),
      // ONLY the terminal channel puts calls here: registry (MCP) tool calls are executed by the SDK and
      // recorded through the pipeline's own side-channel, so surfacing them would double-count them AND leak
      // them into a member-visible payload (D112 (5) — terminal calls have exactly one consumer). Absent
      // (never `[]`) when the channel did not mount, so the fold reads "no channel" and runs its own round.
      ...(this.ctx.captureTerminalTools === true ? { toolCalls: this.terminalToolCalls } : {}),
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
    } else if (block.type === "tool_use") {
      captureTerminalCall(acc, block);
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

/** The TERMINAL capture (D112 R1, half 3): a `tool_use` block from OUR terminal mount becomes a
 *  {@link ToolCallInput}. A registry-mount call is skipped — the SDK executes those and the pipeline records
 *  them on its own channel. A capture-off turn skips everything (a plain tool turn stays byte-identical). */
function captureTerminalCall(acc: TurnAccumulator, block: { readonly id: string; readonly name: string; readonly input: unknown }): void {
  if (acc.ctx.captureTerminalTools !== true) {
    return;
  }
  const call = toTerminalCall(block);
  if (call !== null) {
    acc.terminalToolCalls.push(call);
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
  // Every fold starts from `?? 0`, so the FIRST billed entry turns a null axis into a number and an empty
  // `modelUsage` leaves every one of them null (the absence contract on `usageAcc`).
  for (const modelUsage of Object.values(message.modelUsage)) {
    acc.usageAcc.tokensIn = (acc.usageAcc.tokensIn ?? 0) + modelUsage.inputTokens;
    acc.usageAcc.tokensOut = (acc.usageAcc.tokensOut ?? 0) + modelUsage.outputTokens;
    acc.usageAcc.cacheReadTokens += modelUsage.cacheReadInputTokens;
    acc.usageAcc.cacheWriteTokens += modelUsage.cacheCreationInputTokens;
    acc.usageAcc.costUsd = (acc.usageAcc.costUsd ?? 0) + modelUsage.costUSD;
    acc.usageAcc.webSearchRequests += modelUsage.webSearchRequests;
    // Prefer the configured cap over the model's reported capability, so provenance reflects the user's budget.
    acc.usageAcc.contextWindow = Math.max(acc.usageAcc.contextWindow ?? 0, acc.ctx.configuredMaxContextTokens ?? modelUsage.contextWindow);
    acc.usageAcc.maxOutputTokens = Math.max(acc.usageAcc.maxOutputTokens ?? 0, acc.ctx.configuredMaxOutputTokens ?? modelUsage.maxOutputTokens);
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
  // A TERMINAL tool's denial is the MECHANISM, not a leak: the deny hook is exactly what keeps the co-emitted
  // state call from executing and earning a second model call. Counting it would fire the firewall alarm on
  // every folded turn and bury a real leak in the noise.
  const toolNames = denials.map((d) => d.tool_name).filter((name) => !isTerminalToolCall(name));
  if (toolNames.length === 0) {
    return;
  }
  acc.emit({ kind: "permission_leak", at: acc.ctx.now(), toolNames });
  logProviderLeak({ model: acc.ctx.model, toolNames });
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
