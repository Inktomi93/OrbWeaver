//
// The stream→ChatResult reducer (consumeTurnStream) + the backend factory (createAgentSdkBackend),
// driven by hand-built message streams + an injected fake `query` — no live spawn. Asserts: a success
// stream reduces to a ChatResult (reply/usage/finishReason) and reports the session id once; an error
// result throws a typed ProviderError; the init shape guard fires; and a second turn RESUMES the cached
// session (the Max-sub prompt-cache survival) while a non-agent-sdk request fail-closes.

import type { ChatId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import type { AgentSdkChatRequest, ChatRequest, ChatResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import { consumeTurnStream, createAgentSdkBackend, mergeMountedOptions } from "@orb/server/infra/providers/backends/agent-sdk";
import { seedSessionId } from "@orb/server/infra/providers/backends/agent-sdk/session";
import { describe, vi } from "vitest";
import { makeModelCapability, makeOpenRouterCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { wireSchema } from "../../../../../support/wire-ready.ts";
import { streamOf as sharedStreamOf } from "./_support.ts";

/** Pull the tagged `provider.*` lines a spied pino level captured (filters out other backend chatter). */
function providerLines(spy: ReturnType<typeof vi.spyOn>, event: string): Record<string, unknown>[] {
  return spy.mock.calls
    .map((c: readonly unknown[]) => c[0] as Record<string, unknown>)
    .filter((f: Record<string, unknown>) => f["provider"] === true && f["event"] === event);
}

const MODEL = "claude-x";
const SESSION_ID = "sess-1";
const FIXED_NOW = 1000;
const MISSING_SESSION_ID_RE = /missing session_id/u;

/** The reducer's stream param type, named without importing the SDK (its private to the backend). */
type MessageStream = Parameters<typeof consumeTurnStream>[0];

// The OR-skin (mode-2) credential — a VALID agent-sdk source whose env builder uses the EMPTY isolated
// config dir (never reads host `.claude`), so these source-agnostic runner tests stay hermetic. (vllm was
// retired from agent-sdk 2026-07-27, so it can no longer serve as the keyless test credential here.)
const AGENT_CRED = makeOpenRouterCredential({ apiKey: "sk-or-test" });

const CAPABILITY = makeModelCapability({
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 200_000 },
});

// A model whose wire-shape HONORS mid-conversation-system authority (Opus 4.8 on the anthropic-messages
// shape) — the only capability on which the resolved channel reaches `message-tail` (the hook path).
const MID_CONV_CAPABILITY = makeModelCapability({
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 200_000 },
  turns: {
    assistantPrefill: false,
    midConversationSystem: true,
    historySystemRows: false,
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
  },
});

/** A text-only seed turn — the agent-sdk seed carries content BLOCKS since #1605. */
function seedTurn(role: "user" | "assistant", text: string): { role: "user" | "assistant"; content: [{ type: "text"; text: string }] } {
  return { role, content: [{ type: "text", text }] };
}

function streamOf(messages: readonly unknown[]): MessageStream {
  return sharedStreamOf(messages) as MessageStream;
}

/** The four SDK-legible aggregates `getContextUsage()` returns (the rest of the response shape — grid /
 *  categories / memory files — is irrelevant to the SDK-free `ContextUsage` mapper, so the fake omits it). */
const CONTEXT_USAGE_RESPONSE = {
  totalTokens: 12_000,
  maxTokens: 200_000,
  percentage: 6,
  model: MODEL,
};

/** Wrap a message stream into a fake SDK `Query` that ALSO exposes a `getContextUsage` control method — the
 *  live-`Query` shape `runChatTurn` probes (a bare async generator, like `streamOf`, lacks it, which is how
 *  the "no control channel" absence path is exercised). `getContextUsage` is caller-supplied so a test can
 *  make it resolve, throw, or hang. */
function queryOf(messages: readonly unknown[], getContextUsage: () => Promise<unknown>): MessageStream {
  const stream = streamOf(messages) as MessageStream & {
    getContextUsage: () => Promise<unknown>;
  };
  stream.getContextUsage = getContextUsage;
  return stream;
}

const initMsg = {
  type: "system",
  subtype: "init",
  session_id: SESSION_ID,
  apiKeySource: "oauth",
  model: MODEL,
};
const assistantMsg = {
  type: "assistant",
  session_id: SESSION_ID,
  message: { content: [{ type: "text", text: "Hello" }], stop_reason: "end_turn" },
};
const successResult = {
  type: "result",
  subtype: "success",
  session_id: SESSION_ID,
  num_turns: 1,
  stop_reason: "end_turn",
  duration_api_ms: 100,
  ttft_ms: 20,
  is_error: false,
  modelUsage: {
    [MODEL]: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      webSearchRequests: 0,
      costUSD: 0.001,
      contextWindow: 200_000,
      maxOutputTokens: 4096,
    },
  },
  usage: { cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } },
};

const baseCtx = { model: MODEL, resumed: false, now: (): number => FIXED_NOW };

/** The wired chat-turn fn (the backend always sets it; the cast drops the contract's `| undefined`). */
type ChatTurn = (req: ChatRequest) => Promise<ChatResult>;

/** An SDK hook callback as the captured options carry it — the tests INVOKE it (a hook that only exists in the
 *  options map proves nothing about what it answers). Typed to the fields the runner's hooks read. */
type HookFn = (input: { hook_event_name: string; tool_name?: string; tool_input?: unknown }) => Promise<unknown>;

describe("consumeTurnStream", () => {
  test("reduces a success stream to a ChatResult and reports the session id once", async () => {
    const onSessionId = vi.fn();
    const result = await consumeTurnStream(streamOf([initMsg, assistantMsg, successResult]), {
      ...baseCtx,
      onSessionId,
    });
    expect(result.reply).toBe("Hello");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.tokensIn).toBe(10);
    expect(result.usage.tokensOut).toBe(5);
    expect(result.usage.costUsd).toBeCloseTo(0.001);
    expect(result.numTurns).toBe(1);
    expect(onSessionId).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
  });

  test("an error result throws a typed ProviderError", async () => {
    const errorResult = {
      type: "result",
      subtype: "error_during_execution",
      session_id: SESSION_ID,
      num_turns: 1,
      stop_reason: null,
      errors: ["boom"],
      modelUsage: {},
      usage: {},
    };
    await expect(consumeTurnStream(streamOf([initMsg, errorResult]), baseCtx)).rejects.toBeInstanceOf(ProviderError);
  });

  test("a stream that ENDS without a result frame is a truncated turn, never a success (#1400)", async () => {
    // The defect: plain EOF fell out of the `for await` into `acc.finish(...)`, so a subprocess or transport
    // that died mid-turn produced a normal ChatResult carrying the PARTIAL assistant text (numTurns 0,
    // stopReason null) — which the engine commits as the finished reply.
    const err: unknown = await consumeTurnStream(streamOf([initMsg, assistantMsg]), baseCtx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).terminalReason).toBe("stream_truncated");
    // Retryable: nothing durable happened, so a replay is safe — the same posture the sibling summarize
    // reducer already took for a missing result frame.
    expect((err as ProviderError).retryable).toBe(true);
  });

  test("a stream carrying ONLY the init frame is truncation too", async () => {
    await expect(consumeTurnStream(streamOf([initMsg]), baseCtx)).rejects.toBeInstanceOf(ProviderError);
  });

  test("the init shape guard fires when session_id is missing", async () => {
    const badInit = { type: "system", subtype: "init", apiKeySource: "oauth" };
    await expect(consumeTurnStream(streamOf([badInit]), baseCtx)).rejects.toThrow(MISSING_SESSION_ID_RE);
  });

  test("thinking_tokens frames fill usage.reasoningTokens (running total — last wins)", async () => {
    const thinking = (estimated: number): unknown => ({
      type: "system",
      subtype: "thinking_tokens",
      session_id: SESSION_ID,
      estimated_tokens: estimated,
      estimated_tokens_delta: estimated,
    });
    const result = await consumeTurnStream(streamOf([initMsg, thinking(40), assistantMsg, thinking(120), successResult]), baseCtx);
    expect(result.usage.reasoningTokens).toBe(120);
  });

  test("a turn with no thinking_tokens frames reports reasoningTokens null", async () => {
    const result = await consumeTurnStream(streamOf([initMsg, assistantMsg, successResult]), baseCtx);
    expect(result.usage.reasoningTokens).toBeNull();
  });

  // THE MEASURED-ZERO DEFECT. A success frame CAN carry an empty `modelUsage` (nothing billed under this
  // turn's model — a fully cached/short-circuited loop, or a frame the CLI emits without the map). A
  // fabricated 0 does not stay cosmetic: `canon-write.ts::variantEconomics` stamps `tokenProvenance`
  // 'measured' on any non-null token pair (0 !== null) and the stats rollups then count a $0.00 COST
  // SAMPLE, so an unmeasured turn is laundered into measured provenance and drags the owner's averages.
  // The other three mappers all report absence as null; this one must too.
  test("an empty modelUsage reports NULL on every billed axis — never a measured zero", async () => {
    const unbilled = { ...successResult, modelUsage: {}, usage: {} };
    const result = await consumeTurnStream(streamOf([initMsg, assistantMsg, unbilled]), baseCtx);
    expect(result.usage).toMatchObject({
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      contextWindow: null,
      maxOutputTokens: null,
      cacheCreation5mTokens: null,
      cacheCreation1hTokens: null,
      // The contract's non-nullable counters: 0 IS the honest "nothing read / written / searched".
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      webSearchRequests: 0,
    });
    // Non-vacuity control: the SAME reducer over a frame that DID bill reports numbers, so the nulls above
    // are the absence path and not a reducer that stopped folding usage altogether.
    const billed = await consumeTurnStream(streamOf([initMsg, assistantMsg, successResult]), baseCtx);
    expect(billed.usage).toMatchObject({ tokensIn: 10, tokensOut: 5, contextWindow: 200_000, cacheCreation5mTokens: 0 });
  });

  test("the provider.turn log OMITS an unbilled axis instead of logging a measured zero", async () => {
    const info = vi.spyOn(logger, "info");
    const unbilled = { ...successResult, modelUsage: {}, usage: {} };
    await consumeTurnStream(streamOf([initMsg, assistantMsg, unbilled]), baseCtx);
    const usage = (providerLines(info, "provider.turn")[0] as Record<string, unknown> | undefined)?.["usage"] as Record<string, unknown> | undefined;
    expect(usage).toBeDefined();
    expect(usage).not.toHaveProperty("tokensIn");
    expect(usage).not.toHaveProperty("tokensOut");
    expect(usage).not.toHaveProperty("costUsd");
    expect(usage).toMatchObject({ cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  test("a model_refusal_no_fallback frame emits a `refusal` event carrying the category", async () => {
    const refusal = {
      type: "system",
      subtype: "model_refusal_no_fallback",
      session_id: SESSION_ID,
      original_model: MODEL,
      request_id: null,
      api_refusal_category: "cyber",
      api_refusal_explanation: "declined",
      content: "banner text",
    };
    const onEvent = vi.fn();
    const result = await consumeTurnStream(streamOf([initMsg, refusal, assistantMsg, successResult]), { ...baseCtx, onEvent });
    const events = result.events.filter((e) => e.kind === "refusal");
    expect(events).toEqual([
      {
        kind: "refusal",
        at: FIXED_NOW,
        model: MODEL,
        category: "cyber",
        explanation: "declined",
        retried: false,
        fallbackModel: null,
      },
    ]);
    expect(onEvent).toHaveBeenCalledWith(events[0]);
  });

  test("an error result classifies + carries the terminal_reason provenance (model + detail)", async () => {
    // A backend-side context overflow: the SDK reports subtype error_during_execution (generic) BUT
    // terminal_reason "prompt_too_long" (specific). The reducer must PREFER the terminal reason → invalid,
    // and carry model + terminalReason + detail for debuggability.
    const errorResult = {
      type: "result",
      subtype: "error_during_execution",
      session_id: SESSION_ID,
      num_turns: 1,
      stop_reason: null,
      terminal_reason: "prompt_too_long",
      permission_denials: [],
      errors: ["context too long"],
      modelUsage: {},
      usage: {},
    };
    const err = await consumeTurnStream(streamOf([initMsg, errorResult]), baseCtx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    const perr = err as ProviderError;
    expect(perr.kind).toBe("invalid");
    expect(perr.retryable).toBe(false);
    expect(perr.model).toBe(MODEL);
    expect(perr.terminalReason).toBe("prompt_too_long");
    expect(perr.detail).toBe("prompt_too_long");
  });

  test("a rate_limit_event maps the overage detail fields onto the snapshot (ban-risk provenance)", async () => {
    const rateLimit = {
      type: "rate_limit_event",
      session_id: SESSION_ID,
      rate_limit_info: {
        status: "allowed_warning",
        rateLimitType: "five_hour",
        resetsAt: 2,
        utilization: 0.9,
        isUsingOverage: true,
        surpassedThreshold: 0.75,
        overageStatus: "allowed",
        overageResetsAt: 5,
        overageDisabledReason: undefined,
        errorCode: undefined,
      },
    };
    const onEvent = vi.fn();
    const result = await consumeTurnStream(streamOf([initMsg, rateLimit, assistantMsg, successResult]), { ...baseCtx, onEvent });
    expect(result.rateLimit).toEqual({
      status: "allowed_warning",
      rateLimitType: "five_hour",
      resetsAt: 2000, // seconds → ms at the boundary
      utilization: 0.9,
      isUsingOverage: true,
      surpassedThreshold: 0.75,
      overageStatus: "allowed",
      overageResetsAt: 5000,
      overageDisabledReason: undefined,
      errorCode: undefined,
    });
    // The event carries the ban-risk isUsingOverage signal (the previously-lossy projection).
    const rl = result.events.find((e) => e.kind === "rate_limit");
    expect(rl).toMatchObject({ isUsingOverage: true });
  });

  test("a non-empty permission_denials emits a `permission_leak` event (the firewall tripwire)", async () => {
    // With the locked tool-less config this MUST be empty; a leak must be LOUD, never swallowed.
    const leakedResult = {
      ...successResult,
      permission_denials: [{ tool_name: "Bash", tool_use_id: "t1", tool_input: { command: "rm -rf" } }],
    };
    const onEvent = vi.fn();
    const result = await consumeTurnStream(streamOf([initMsg, assistantMsg, leakedResult]), {
      ...baseCtx,
      onEvent,
    });
    const leaks = result.events.filter((e) => e.kind === "permission_leak");
    expect(leaks).toEqual([{ kind: "permission_leak", at: FIXED_NOW, toolNames: ["Bash"] }]);
    expect(onEvent).toHaveBeenCalledWith(leaks[0]);
  });

  test("a redacted_thinking block sets reasoningRedacted (thought, but the CoT was withheld)", async () => {
    // The OR-skin path emits redacted_thinking (encrypted CoT, NO text) alongside text.
    const redacted = {
      type: "assistant",
      session_id: SESSION_ID,
      message: {
        content: [
          { type: "redacted_thinking", data: "ENCRYPTED" },
          { type: "text", text: "Hi" },
        ],
        stop_reason: "end_turn",
      },
    };
    const result = await consumeTurnStream(streamOf([initMsg, redacted, successResult]), baseCtx);
    expect(result.reasoning).toBe(""); // no readable CoT
    expect(result.reasoningRedacted).toBe(true); // but the model DID reason
  });

  test("a turn with no redacted blocks reports reasoningRedacted false", async () => {
    const result = await consumeTurnStream(streamOf([initMsg, assistantMsg, successResult]), baseCtx);
    expect(result.reasoningRedacted).toBe(false);
  });

  test("a text_delta stream event fires onDelta once and is NOT double-counted into the final reply", async () => {
    // The live UI is driven by stream deltas, but the CANONICAL reply text comes ONLY from the final
    // assistant frame (handleAssistant) — a delta must NOT be re-accumulated into result.reply.
    const textDelta = {
      type: "stream_event",
      session_id: SESSION_ID,
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
    };
    const onDelta = vi.fn();
    const result = await consumeTurnStream(streamOf([initMsg, textDelta, assistantMsg, successResult]), { ...baseCtx, chatId: castId<ChatId>("c1"), onDelta });
    expect(onDelta).toHaveBeenCalledExactlyOnceWith({ chatId: "c1", kind: "text", text: "Hello" });
    // The assistant frame's text is "Hello"; the delta text is NOT concatenated on top of it.
    expect(result.reply).toBe("Hello");
  });

  test("a thinking_delta stream event fires onDelta reasoning and is NOT accumulated into the final reasoning", async () => {
    // Same discipline as text: the reasoning delta drives the live trace UI, but stored reasoning comes
    // ONLY from the final assistant `thinking` block (avoids double-counting; runner ~line 306/876).
    const thinkingDelta = {
      type: "stream_event",
      session_id: SESSION_ID,
      event: {
        type: "content_block_delta",
        delta: { type: "thinking_delta", thinking: "pondering" },
      },
    };
    const thinkingAssistant = {
      type: "assistant",
      session_id: SESSION_ID,
      message: {
        content: [
          { type: "thinking", thinking: "final CoT" },
          { type: "text", text: "Hello" },
        ],
        stop_reason: "end_turn",
      },
    };
    const onDelta = vi.fn();
    const result = await consumeTurnStream(streamOf([initMsg, thinkingDelta, thinkingAssistant, successResult]), {
      ...baseCtx,
      chatId: castId<ChatId>("c1"),
      onDelta,
    });
    expect(onDelta).toHaveBeenCalledExactlyOnceWith({
      chatId: "c1",
      kind: "reasoning",
      text: "pondering",
    });
    // Stored reasoning is the FINAL assistant thinking block only — the delta text is not folded in.
    expect(result.reasoning).toBe("final CoT");
  });

  test("a signature_delta stream event is tolerated (sub-path thinking is signature-only)", async () => {
    // The SUB path emits ONLY signature_delta for thinking (no thinking_delta; final thinking is empty).
    const sigDelta = {
      type: "stream_event",
      session_id: SESSION_ID,
      event: { type: "content_block_delta", delta: { type: "signature_delta", signature: "SIG" } },
    };
    const onDelta = vi.fn();
    const result = await consumeTurnStream(streamOf([initMsg, sigDelta, assistantMsg, successResult]), { ...baseCtx, chatId: castId<ChatId>("c1"), onDelta });
    // No crash, empty reasoning, and the signature never surfaced as a reasoning delta.
    expect(result.reply).toBe("Hello");
    expect(result.reasoning).toBe("");
    expect(onDelta).not.toHaveBeenCalled();
  });

  test("warm_spare_claimed surfaces on the result (cold-start indicator)", async () => {
    const warmResult = { ...successResult, warm_spare_claimed: true };
    const result = await consumeTurnStream(streamOf([initMsg, assistantMsg, warmResult]), baseCtx);
    expect(result.warmSpareClaimed).toBe(true);
  });

  test("a NON-retryable api_retry frame throws the classified error immediately (D17 fail-fast)", async () => {
    // The runtime sometimes retries a non-retryable failure (a backend reports context overflow as
    // invalid_request) with exponential backoff — minutes of futile grinding. handleApiRetry classifies
    // the SDK error and, when non-retryable, throws NOW to abort the retry (the ban-risk fail-fast).
    const apiRetry = {
      type: "system",
      subtype: "api_retry",
      session_id: SESSION_ID,
      attempt: 1,
      max_retries: 5,
      retry_delay_ms: 2000,
      error_status: 400,
      error: "invalid_request", // classifies invalid / non-retryable
      uuid: "u-retry-1",
    };
    const err = await consumeTurnStream(streamOf([initMsg, apiRetry, successResult]), baseCtx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    const perr = err as ProviderError;
    expect(perr.kind).toBe("invalid");
    expect(perr.retryable).toBe(false);
    expect(perr.apiErrorStatus).toBe(400);
  });

  test("a RETRYABLE api_retry frame does NOT throw — the stream continues to completion", async () => {
    // rate_limit is retryable: the runtime's backoff-and-retry is legitimate here, so handleApiRetry must
    // emit the api_retry event but let the turn proceed (it succeeds on the retry).
    const apiRetry = {
      type: "system",
      subtype: "api_retry",
      session_id: SESSION_ID,
      attempt: 1,
      max_retries: 5,
      retry_delay_ms: 2000,
      error_status: 429,
      error: "rate_limit",
      uuid: "u-retry-2",
    };
    const result = await consumeTurnStream(streamOf([initMsg, apiRetry, assistantMsg, successResult]), baseCtx);
    expect(result.reply).toBe("Hello");
    const retries = result.events.filter((e) => e.kind === "api_retry");
    expect(retries).toHaveLength(1);
  });

  test("classifyResult: a stored lastRetryError WINS over the result's terminal_reason", async () => {
    // A retryable rate_limit api_retry stores lastRetryError; the turn then ends error with a DIFFERENT
    // terminal_reason. Precedence #1 (the retry/rate-limit code) must win over #2 (terminal_reason).
    const rateLimitRetry = {
      type: "system",
      subtype: "api_retry",
      session_id: SESSION_ID,
      attempt: 1,
      max_retries: 5,
      retry_delay_ms: 2000,
      error_status: 429,
      error: "rate_limit",
      uuid: "u-retry-3",
    };
    const errorResult = {
      type: "result",
      subtype: "error_during_execution",
      session_id: SESSION_ID,
      num_turns: 1,
      stop_reason: null,
      terminal_reason: "model_error", // #2 would classify server; #1 (rate_limit) must win
      permission_denials: [],
      errors: [],
      modelUsage: {},
      usage: {},
    };
    const err = await consumeTurnStream(streamOf([initMsg, rateLimitRetry, errorResult]), baseCtx).catch((e: unknown) => e);
    const perr = err as ProviderError;
    expect(perr.kind).toBe("rate_limit");
    expect(perr.detail).toBe("rate_limit");
  });

  test("classifyResult: a rate-limited error RESULT attaches resetsAt from the rate-limit snapshot", async () => {
    // A rejected rate_limit_event seeds acc.rateLimit (status rejected → rate-limited) with a resetsAt; the
    // error result then classifies rate_limit and buildResultError attaches that resetsAt to the error.
    const rateLimit = {
      type: "rate_limit_event",
      session_id: SESSION_ID,
      rate_limit_info: {
        status: "rejected",
        rateLimitType: "five_hour",
        resetsAt: 7, // epoch SECONDS → 7000 ms at the boundary
        utilization: 1,
        isUsingOverage: false,
        surpassedThreshold: 1,
        overageStatus: "disabled",
        overageResetsAt: 0,
        overageDisabledReason: undefined,
        errorCode: undefined,
      },
    };
    const errorResult = {
      type: "result",
      subtype: "error_during_execution",
      session_id: SESSION_ID,
      num_turns: 1,
      stop_reason: null,
      permission_denials: [],
      errors: [],
      modelUsage: {},
      usage: {},
    };
    const err = await consumeTurnStream(streamOf([initMsg, rateLimit, errorResult]), baseCtx).catch((e: unknown) => e);
    const perr = err as ProviderError;
    expect(perr.kind).toBe("rate_limit");
    expect(perr.resetsAt).toBe(7000);
  });

  test("classifyResult: subtype fallback when terminal_reason is absent (no retry, no terminal)", async () => {
    // No stored retry error, no terminal_reason → precedence falls through to #3, the coarse subtype.
    const errorResult = {
      type: "result",
      subtype: "error_max_budget_usd", // classifies billing / non-retryable
      session_id: SESSION_ID,
      num_turns: 1,
      stop_reason: null,
      permission_denials: [],
      errors: [],
      modelUsage: {},
      usage: {},
    };
    const err = await consumeTurnStream(streamOf([initMsg, errorResult]), baseCtx).catch((e: unknown) => e);
    const perr = err as ProviderError;
    expect(perr.kind).toBe("billing");
    expect(perr.detail).toBe("error_max_budget_usd");
    expect(perr.terminalReason).toBeUndefined();
  });

  test("a model_refusal_fallback frame reports the retry + the fallback model", async () => {
    const refusal = {
      type: "system",
      subtype: "model_refusal_fallback",
      session_id: SESSION_ID,
      trigger: "refusal",
      direction: "retry",
      original_model: MODEL,
      fallback_model: "claude-y",
      request_id: null,
      content: "",
    };
    const result = await consumeTurnStream(streamOf([initMsg, refusal, assistantMsg, successResult]), baseCtx);
    expect(result.events.filter((e) => e.kind === "refusal")).toEqual([
      {
        kind: "refusal",
        at: FIXED_NOW,
        model: MODEL,
        category: null,
        explanation: null,
        retried: true,
        fallbackModel: "claude-y",
      },
    ]);
  });
});

describe("createAgentSdkBackend", () => {
  // The narrowed agent-sdk arm (not the ChatRequest union) so tests can spread + override fields
  // without TS collapsing the discriminated union.
  function buildReq(chatId: ChatId): AgentSdkChatRequest {
    return {
      api: "agent-sdk",
      prompt: "hi",
      credential: AGENT_CRED,
      model: castId<ModelId>(MODEL),
      capability: CAPABILITY,
      params: {},
      systemPrompt: { static: "", dynamic: "" },
      // The derived OR-skin tier map rides every agent-sdk request (a vLLM turn ignores it; the field is
      // required so mode-2 never dispatches without it).
      orSkinTierModels: {
        opus: "anthropic/claude-opus-4.8",
        sonnet: "anthropic/claude-sonnet-5",
        haiku: "anthropic/claude-haiku-4.5",
      },
      chatId,
    };
  }

  test("runChatTurn reduces a turn; a second turn RESUMES the cached session", async () => {
    const fakeQuery = vi.fn((_args: { options?: { resume?: string } }) => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    expect(backend.runChatTurn).toBeDefined();
    const run = backend.runChatTurn as ChatTurn;

    const first = await run(buildReq(castId<ChatId>("chat-1")));
    expect(first.reply).toBe("Hello");
    // Turn 1 started fresh (no resume); turn 2 resumes the session id the SDK reported.
    expect(fakeQuery.mock.calls[0]?.[0]?.options?.resume).toBeUndefined();

    await run(buildReq(castId<ChatId>("chat-1")));
    expect(fakeQuery.mock.calls[1]?.[0]?.options?.resume).toBe(SESSION_ID);
  });

  test("a seeded request resumes the DETERMINISTIC seeded session (the PD-7 canon feed)", async () => {
    const fakeQuery = vi.fn((_args: { options?: { resume?: string } }) => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const run = backend.runChatTurn as ChatTurn;
    const seed = [seedTurn("user", "hello"), seedTurn("assistant", "hi there")];
    // Turn 1 is a COLD cache (no recorded session) → resumes the deterministic seed-derived id.
    await run({ ...buildReq(castId<ChatId>("chat-seeded")), seed, prompt: "next question" });
    expect(fakeQuery.mock.calls[0]?.[0]?.options?.resume).toBe(seedSessionId(castId<ChatId>("chat-seeded"), seed));

    // Turn 1's stream reported session_id=SESSION_ID → recorded. Turn 2's canon DIVERGES (swipe), and
    // the store is replace-capable → reseed IN PLACE under the RECORDED id (keeps the conv cache
    // lineage), NOT a fresh deterministic id.
    const swipeSeed = [...seed, seedTurn("user", "prompt")];
    await run({ ...buildReq(castId<ChatId>("chat-seeded")), seed: swipeSeed, prompt: "regenerate" });
    expect(fakeQuery.mock.calls[1]?.[0]?.options?.resume).toBe(SESSION_ID);
  });

  test("resolved 'system-block' channel JOINS static+dynamic into ONE leak-free systemPrompt string, no hooks", async () => {
    const fakeQuery = vi.fn((_args: { options?: { systemPrompt?: string | string[]; hooks?: Record<string, unknown[]> } }) =>
      streamOf([initMsg, assistantMsg, successResult]),
    );
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const run = backend.runChatTurn as ChatTurn;
    // CAPABILITY has no `turns` → floors to midConversationSystem:false → the channel resolves to
    // system-block regardless of the knob (the funnel-driven default).
    await run({
      ...buildReq(castId<ChatId>("chat-sys")),
      systemPrompt: { static: "STATIC-HALF", dynamic: "DYNAMIC-HALF" },
    });
    const opts = fakeQuery.mock.calls[0]?.[0]?.options;
    // buildSystemPrompt JOINS the halves (static\n\ndynamic) — the [static, BOUNDARY, dynamic] array form
    // is forbidden (b1 2026-07-10, SDK 0.3.206: the runtime split is flag-gated OFF → the marker leaks).
    expect(opts?.systemPrompt).toBe("STATIC-HALF\n\nDYNAMIC-HALF");
    expect(opts?.hooks).toBeUndefined();
  });

  test("resolved 'message-tail' channel (knob 'hook' + capable model) sends STATIC-only systemPrompt + a hook", async () => {
    const fakeQuery = vi.fn((_args: { options?: { systemPrompt?: string; hooks?: Record<string, unknown[]> } }) =>
      streamOf([initMsg, assistantMsg, successResult]),
    );
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const run = backend.runChatTurn as ChatTurn;
    await run({
      ...buildReq(castId<ChatId>("chat-hook")),
      capability: MID_CONV_CAPABILITY,
      systemPrompt: { static: "STATIC-HALF", dynamic: "DYNAMIC-HALF" },
      params: { advanced: { dynamicContext: "hook" } },
    });
    const opts = fakeQuery.mock.calls[0]?.[0]?.options;
    // Static half rides the (cached) system prompt; dynamic half is off it entirely.
    expect(opts?.systemPrompt).toBe("STATIC-HALF");
    // The dynamic half rides a UserPromptSubmit hook (cache-safe injection).
    expect(opts?.hooks?.["UserPromptSubmit"]).toHaveLength(1);
  });

  test("knob 'hook' on an INCAPABLE model is DEMOTED → joined system-block, no hook", async () => {
    const fakeQuery = vi.fn((_args: { options?: { systemPrompt?: string; hooks?: Record<string, unknown[]> } }) =>
      streamOf([initMsg, assistantMsg, successResult]),
    );
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const run = backend.runChatTurn as ChatTurn;
    // CAPABILITY floors mid-conv-system to false → the funnel demotes the tail request to system-block.
    await run({
      ...buildReq(castId<ChatId>("chat-demote")),
      systemPrompt: { static: "STATIC-HALF", dynamic: "DYNAMIC-HALF" },
      params: { advanced: { dynamicContext: "hook" } },
    });
    const opts = fakeQuery.mock.calls[0]?.[0]?.options;
    expect(opts?.systemPrompt).toBe("STATIC-HALF\n\nDYNAMIC-HALF");
    expect(opts?.hooks).toBeUndefined();
  });

  test("contextUsage: a best-effort getContextUsage probe surfaces on the ChatResult", async () => {
    const getContextUsage = vi.fn(() => Promise.resolve(CONTEXT_USAGE_RESPONSE));
    const fakeQuery = vi.fn(() => queryOf([initMsg, assistantMsg, successResult], getContextUsage));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const result = await (backend.runChatTurn as ChatTurn)(buildReq(castId<ChatId>("chat-ctx")));
    // The SDK response is mapped to the SDK-free contract shape (only the four aggregates).
    expect(result.contextUsage).toEqual({
      totalTokens: 12_000,
      maxTokens: 200_000,
      percentage: 6,
      model: MODEL,
    });
    // Probed on the LIVE query, after the stream drained.
    expect(getContextUsage).toHaveBeenCalledOnce();
  });

  test("contextUsage: a throwing probe leaves it ABSENT and the turn still succeeds", async () => {
    const getContextUsage = vi.fn(() => Promise.reject(new Error("control channel down")));
    const fakeQuery = vi.fn(() => queryOf([initMsg, assistantMsg, successResult], getContextUsage));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const result = await (backend.runChatTurn as ChatTurn)(buildReq(castId<ChatId>("chat-ctx-throw")));
    // The probe failed — contextUsage absent, but the turn is fully intact.
    expect(result.contextUsage).toBeUndefined();
    expect(result.reply).toBe("Hello");
  });

  test("contextUsage: a HANGING probe hits the 2s bound → absent, turn unblocked (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      // A never-resolving getContextUsage — only the bounded timeout can resolve the race.
      const getContextUsage = vi.fn(() => new Promise<never>(() => undefined));
      const fakeQuery = vi.fn(() => queryOf([initMsg, assistantMsg, successResult], getContextUsage));
      const backend = createAgentSdkBackend({
        now: () => 0,
        query: fakeQuery as never,
        refreshHostSubToken: () => Promise.resolve(false),
      });
      const runPromise = (backend.runChatTurn as ChatTurn)(buildReq(castId<ChatId>("chat-ctx-hang")));
      // Drain microtasks so the stream completes and the probe's timeout timer is armed, then trip it.
      await vi.advanceTimersByTimeAsync(2000);
      const result = await runPromise;
      expect(result.contextUsage).toBeUndefined();
      expect(result.reply).toBe("Hello");
    } finally {
      vi.useRealTimers();
    }
  });

  test("contextUsage: absent when the query exposes no getContextUsage control method", async () => {
    // A bare async-generator stream (no control channel) — the probe self-guards on method presence.
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const result = await (backend.runChatTurn as ChatTurn)(buildReq(castId<ChatId>("chat-no-ctx")));
    expect(result.contextUsage).toBeUndefined();
  });

  test("options.title is the chatId-derived METADATA label (orb:<chatId>), never the user's chat title", async () => {
    const fakeQuery = vi.fn((_args: { options?: { title?: string } }) => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    await (backend.runChatTurn as ChatTurn)(buildReq(castId<ChatId>("chat-titled")));
    expect(fakeQuery.mock.calls[0]?.[0]?.options?.title).toBe("orb:chat-titled");
  });

  test("a non-agent-sdk request fail-closes with a typed ProviderError", async () => {
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: vi.fn() as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    expect(backend.runChatTurn).toBeDefined();
    const run = backend.runChatTurn as ChatTurn;
    // @orb-waive no-test-fabrication(unknown): deliberate wrong-api-shape probe of the fail-closed path. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const wrongApi = { api: "chat-completions" } as unknown as ChatRequest;
    await expect(run(wrongApi)).rejects.toBeInstanceOf(ProviderError);
  });

  test("surfaces a resolve-chat dropped knob as a `warning` event (in events AND via onEvent)", async () => {
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({
      now: () => FIXED_NOW,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const run = backend.runChatTurn as ChatTurn;
    const onEvent = vi.fn();
    // CAPABILITY (reasoning none, sampling {}) exposes no temperature range → resolve-chat drops it + warns.
    const result = await run({ ...buildReq(castId<ChatId>("chat-warn")), params: { temperature: 0.7 }, onEvent });
    const warnings = result.events.filter((e) => e.kind === "warning");
    expect(warnings).toEqual([
      {
        kind: "warning",
        at: FIXED_NOW,
        code: "sampling_knob_dropped",
        knob: "temperature",
        message: "temperature ignored: model does not expose a temperature range",
      },
    ]);
    expect(onEvent).toHaveBeenCalledWith(warnings[0]);
  });
});

describe("provider.* observability taxonomy", () => {
  function buildReq(chatId: ChatId): AgentSdkChatRequest {
    return {
      api: "agent-sdk",
      prompt: "hi",
      credential: AGENT_CRED,
      model: castId<ModelId>(MODEL),
      capability: CAPABILITY,
      params: {},
      systemPrompt: { static: "", dynamic: "" },
      orSkinTierModels: {
        opus: "anthropic/claude-opus-4.8",
        sonnet: "anthropic/claude-sonnet-5",
        haiku: "anthropic/claude-haiku-4.5",
      },
      chatId,
    };
  }

  test("consumeTurnStream emits ONE provider.turn (info) per turn — usage + disposition + served model", async () => {
    const info = vi.spyOn(logger, "info");
    await consumeTurnStream(streamOf([initMsg, assistantMsg, successResult]), {
      ...baseCtx,
      chatId: castId<ChatId>("chat-1"),
      disposition: "seeded",
    });
    const turns = providerLines(info, "provider.turn");
    expect(turns).toHaveLength(1);
    const turn = turns[0] as Record<string, unknown>;
    expect(turn["ok"]).toBe(true);
    expect(turn["disposition"]).toBe("seeded");
    expect(turn["chatId"]).toBe("chat-1");
    expect(turn["sessionId"]).toBe(SESSION_ID);
    // apiKeySource + served model captured off the init frame.
    expect(turn["apiKeySource"]).toBe("oauth");
    expect(turn["servedModel"]).toBe(MODEL);
    expect(turn["usage"]).toMatchObject({ tokensIn: 10, tokensOut: 5 });
  });

  test("provider.turn carries the contextUsage when the probe returned", async () => {
    const info = vi.spyOn(logger, "info");
    const getContextUsage = vi.fn(() => Promise.resolve(CONTEXT_USAGE_RESPONSE));
    const fakeQuery = vi.fn(() => queryOf([initMsg, assistantMsg, successResult], getContextUsage));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    await (backend.runChatTurn as ChatTurn)(buildReq(castId<ChatId>("chat-ctx-log")));
    const turns = providerLines(info, "provider.turn");
    expect(turns).toHaveLength(1);
    expect((turns[0] as Record<string, unknown>)["contextUsage"]).toEqual({
      totalTokens: 12_000,
      maxTokens: 200_000,
      percentage: 6,
      model: MODEL,
    });
  });

  test("a failed turn still emits ONE provider.turn (ok:false) AND a provider.error with the sessionId", async () => {
    const info = vi.spyOn(logger, "info");
    const error = vi.spyOn(logger, "error");
    const errorResult = {
      type: "result",
      subtype: "error_during_execution",
      session_id: SESSION_ID,
      num_turns: 1,
      stop_reason: null,
      terminal_reason: "prompt_too_long",
      permission_denials: [],
      errors: ["ctx too long"],
      modelUsage: {},
      usage: {},
    };
    await consumeTurnStream(streamOf([initMsg, errorResult]), baseCtx).catch(() => undefined);
    const turns = providerLines(info, "provider.turn");
    expect(turns).toHaveLength(1);
    expect((turns[0] as Record<string, unknown>)["ok"]).toBe(false);
    // THE DENOMINATOR (docs/design/streaming-shape-churn.md §7.5). `usage.tokensOut` on this line is the SUM
    // over the loop's model calls, `maxOutputTokens` is the PER-CALL ceiling — a live `ok:false` line read
    // `tokensOut:8192` against a 2048 cap and got filed as a cost bug on that arithmetic. Without
    // `numTurns` the line cannot be read correctly, and the FAILURE line is exactly where it is read.
    expect((turns[0] as Record<string, unknown>)["numTurns"]).toBe(1);
    const errs = providerLines(error, "provider.error");
    expect(errs).toHaveLength(1);
    // The backend-internal sessionId rides the error log line (never the SDK-free result).
    expect((errs[0] as Record<string, unknown>)["sessionId"]).toBe(SESSION_ID);
    expect((errs[0] as Record<string, unknown>)["kind"]).toBe("invalid");
  });

  test("a model downgrade (billed ≠ requested) emits provider.drift (warn)", async () => {
    const warn = vi.spyOn(logger, "warn");
    const downgraded = {
      ...successResult,
      modelUsage: {
        "claude-different": {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
          costUSD: 0,
          contextWindow: 200_000,
          maxOutputTokens: 4096,
        },
      },
    };
    await consumeTurnStream(streamOf([initMsg, assistantMsg, downgraded]), baseCtx);
    const drifts = providerLines(warn, "provider.drift");
    expect(drifts).toHaveLength(1);
    expect((drifts[0] as Record<string, unknown>)["billed"]).toStrictEqual(["claude-different"]);
  });

  test("provider.session (debug) fires on a NON-resume decision (a seeded cold cache), not a plain resume", async () => {
    const debug = vi.spyOn(logger, "debug");
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const run = backend.runChatTurn as ChatTurn;
    const seed = [seedTurn("user", "hello")];
    await run({ ...buildReq(castId<ChatId>("chat-sess")), seed });
    const sessions = providerLines(debug, "provider.session");
    expect(sessions).toHaveLength(1);
    expect((sessions[0] as Record<string, unknown>)["disposition"]).toBe("seeded");
  });

  test("provider.channel (debug) records the RESOLVED channel + gating flag on a capable model", async () => {
    const debug = vi.spyOn(logger, "debug");
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const run = backend.runChatTurn as ChatTurn;
    // Absent knob + capable model ⇒ the funnel picks the cache-safe message-tail; nothing was demoted.
    await run({ ...buildReq(castId<ChatId>("chat-chan")), capability: MID_CONV_CAPABILITY });
    const channels = providerLines(debug, "provider.channel");
    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({
      channel: "message-tail",
      midConvCapable: true,
      demoted: false,
    });
  });

  test("provider.channel records demoted:true when a 'hook' request hits an incapable model", async () => {
    const debug = vi.spyOn(logger, "debug");
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const run = backend.runChatTurn as ChatTurn;
    // CAPABILITY floors mid-conv-system to false → the tail request is demoted to system-block.
    await run({
      ...buildReq(castId<ChatId>("chat-chan-demote")),
      params: { advanced: { dynamicContext: "hook" } },
    });
    const channels = providerLines(debug, "provider.channel");
    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({
      channel: "system-block",
      midConvCapable: false,
      demoted: true,
    });
  });

  test("a spawn-death attaches a bounded stderrTail to provider.error; a healthy turn logs none", async () => {
    const error = vi.spyOn(logger, "error");
    // A query whose stream throws AFTER the SDK wrote stderr — the runner's stderr callback captured it.
    const bigStderr = "E".repeat(5000); // exceeds the 2KB tail cap → truncated
    const explodingQuery = vi.fn((args: { options?: { stderr?: (d: string) => void } }) => {
      args.options?.stderr?.(bigStderr);
      async function* boom(): AsyncGenerator<unknown> {
        await Promise.resolve();
        yield initMsg; // the init frame lands (sessionId observed) before the subprocess dies
        throw new Error("subprocess exited");
      }
      return boom() as ReturnType<typeof streamOf>;
    });
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: explodingQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    const run = backend.runChatTurn as ChatTurn;
    await run(buildReq(castId<ChatId>("chat-death"))).catch(() => undefined);
    const errs = providerLines(error, "provider.error");
    expect(errs).toHaveLength(1);
    const tail = (errs[0] as Record<string, unknown>)["stderrTail"];
    expect(typeof tail).toBe("string");
    expect((tail as string).length).toBe(2048); // bounded + truncated to the 2KB cap
  });

  test("a HEALTHY turn logs no provider.error at all — the captured stderr is dropped", async () => {
    const error = vi.spyOn(logger, "error");
    // The CLI wrote benign stderr chatter, but the turn succeeded — no error line, so no tail.
    const healthyQuery = vi.fn((args: { options?: { stderr?: (d: string) => void } }) => {
      args.options?.stderr?.("some benign cli chatter");
      return streamOf([initMsg, assistantMsg, successResult]);
    });
    const healthy = createAgentSdkBackend({
      now: () => 0,
      query: healthyQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    await (healthy.runChatTurn as ChatTurn)(buildReq(castId<ChatId>("chat-ok")));
    expect(providerLines(error, "provider.error")).toHaveLength(0);
  });
});

describe("the chat runner's stateful tool + structured channels", () => {
  interface CapturedOptions {
    mcpServers?: Record<string, unknown>;
    allowedTools?: string[];
    maxTurns?: number;
    outputFormat?: { type: string; schema: Record<string, unknown> };
    disallowedTools?: string[];
    hooks?: { PreToolUse?: { hooks: HookFn[] }[]; UserPromptSubmit?: { hooks: HookFn[] }[] };
  }
  function backendWith(fakeQuery: ReturnType<typeof vi.fn>): ChatTurn {
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    return backend.runChatTurn as ChatTurn;
  }
  const capture = (): ReturnType<typeof vi.fn> => vi.fn((_args: { options?: CapturedOptions }) => streamOf([initMsg, assistantMsg, successResult]));

  function buildToolReq(chatId: ChatId): AgentSdkChatRequest {
    return {
      api: "agent-sdk",
      prompt: "hi",
      credential: AGENT_CRED,
      model: castId<ModelId>(MODEL),
      capability: CAPABILITY,
      params: {},
      systemPrompt: { static: "", dynamic: "" },
      orSkinTierModels: { opus: "o", sonnet: "s", haiku: "h" },
      chatId,
    };
  }

  test("a mounted toolServer rides mcpServers.orbweaver + the namespaced allowlist; maxTurns lifts to rounds+1", async () => {
    const fakeQuery = capture();
    const run = backendWith(fakeQuery);
    const server = { marker: "mcp-server" };
    await run({ ...buildToolReq(castId<ChatId>("chat-tools")), toolServer: server, toolTurnLimit: 3 });
    const opts = fakeQuery.mock.calls[0]?.[0]?.options as CapturedOptions | undefined;
    expect(opts?.mcpServers).toEqual({ orbweaver: server });
    expect(opts?.allowedTools).toEqual(["mcp__orbweaver__*"]);
    expect(opts?.maxTurns).toBe(4);
    // The cowork denylist (the REAL safety boundary) holds regardless of the mount.
    expect(opts?.disallowedTools).toEqual(["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"]);
  });

  test("a tool-less turn keeps the firewall base: mcpServers {} + maxTurns 1 (byte-identical pre-tools)", async () => {
    const fakeQuery = capture();
    const run = backendWith(fakeQuery);
    await run(buildToolReq(castId<ChatId>("chat-plain")));
    const opts = fakeQuery.mock.calls[0]?.[0]?.options as CapturedOptions | undefined;
    expect(opts?.mcpServers).toEqual({});
    expect(opts?.allowedTools).toBeUndefined();
    expect(opts?.maxTurns).toBe(1);
    expect(opts?.outputFormat).toBeUndefined();
  });

  test("responseFormat maps to the SDK's outputFormat json_schema (bound-stripped) with the 2-turn validation floor", async () => {
    const fakeQuery = capture();
    const run = backendWith(fakeQuery);
    await run({
      ...buildToolReq(castId<ChatId>("chat-structured")),
      responseFormat: {
        name: "extraction",
        schema: wireSchema({ type: "object", properties: { hp: { type: "number", minimum: 0 } } }),
      },
    });
    const opts = fakeQuery.mock.calls[0]?.[0]?.options as CapturedOptions | undefined;
    expect(opts?.outputFormat?.type).toBe("json_schema");
    // The Anthropic wire refuses bound keywords — sanitize strips `minimum` (D93); zod re-imposes post-parse.
    // The stripped bound is RELAYED in the node's description (task #40) rather than silently deleted, so the
    // model is still told the floor it is being validated against.
    expect(opts?.outputFormat?.schema).toEqual({ type: "object", properties: { hp: { type: "number", description: "[Constraints: minimum: 0]" } } });
    expect(opts?.maxTurns).toBe(2);
  });
});

// ── D112 R1: the TERMINAL-tool channel (declare + capture, never execute) ────────────────────────────────
// The agent-sdk wire reads no `tools[]`, so a folded turn's state tools ride their OWN in-process MCP mount
// and are stopped dead at the PreToolUse seam: declared to the model, DENIED on use, captured off the ONE
// completion's assistant frame. The proof that matters is the ROUND COUNT — a folded turn must cost exactly
// one model call, which is the whole point of the fold (the fallback round it replaces cost a second).

/** A tool's PARAMETERS as the rpg fold projects them — including the `anyOf` cell (`trackerSets[].value` is
 *  number-or-string), the construct that must lift for the mount to happen at all. */
const TERMINAL_TOOL_SCHEMA = {
  type: "object",
  properties: {
    targetRef: { type: "string", enum: ["user:1", "char:2"] },
    value: { anyOf: [{ type: "number" }, { type: "string" }] },
  },
  required: ["targetRef"],
  additionalProperties: false,
};
const TERMINAL_TOOLS = [
  { name: "update_scene", description: "record the scene", parameters: TERMINAL_TOOL_SCHEMA },
  { name: "no_changes", description: "nothing changed", parameters: { type: "object", properties: {}, additionalProperties: false } },
];
const TERMINAL_NS = "orbstate";
const TERMINAL_PREFIX = `mcp__${TERMINAL_NS}__`;

/** An assistant frame that co-emits prose AND terminal tool calls in ONE completion (the fold's premise). */
function foldedAssistant(calls: readonly { name: string; id: string; input: unknown }[]): unknown {
  return {
    type: "assistant",
    session_id: SESSION_ID,
    message: {
      content: [{ type: "text", text: "She steps into the rain." }, ...calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input }))],
      stop_reason: "tool_use",
    },
  };
}

describe("the chat runner's TERMINAL-tool channel (D112 R1 fold)", () => {
  interface TerminalOptions {
    mcpServers?: Record<string, unknown>;
    allowedTools?: string[];
    maxTurns?: number;
    hooks?: { PreToolUse?: { hooks: HookFn[] }[]; UserPromptSubmit?: { hooks: HookFn[] }[] };
  }
  function runWith(fakeQuery: ReturnType<typeof vi.fn>): ChatTurn {
    const backend = createAgentSdkBackend({
      now: () => 0,
      query: fakeQuery as never,
      refreshHostSubToken: () => Promise.resolve(false),
    });
    return backend.runChatTurn as ChatTurn;
  }
  function terminalReq(chatId: ChatId): AgentSdkChatRequest {
    return {
      api: "agent-sdk",
      prompt: "hi",
      credential: AGENT_CRED,
      model: castId<ModelId>(MODEL),
      capability: CAPABILITY,
      params: {},
      systemPrompt: { static: "", dynamic: "" },
      orSkinTierModels: { opus: "o", sonnet: "s", haiku: "h" },
      chatId,
      terminalTools: TERMINAL_TOOLS,
    };
  }
  const optionsOf = (fakeQuery: ReturnType<typeof vi.fn>): TerminalOptions | undefined =>
    (fakeQuery.mock.calls[0]?.[0] as { options?: TerminalOptions } | undefined)?.options;

  test("mounts its OWN MCP namespace, is never allow-listed, and floors maxTurns at the degrade budget", async () => {
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    await runWith(fakeQuery)(terminalReq(castId<ChatId>("chat-terminal")));
    const opts = optionsOf(fakeQuery);
    expect(Object.keys(opts?.mcpServers ?? {})).toEqual([TERMINAL_NS]);
    // NOT allow-listed, deliberately: an allow-listed tool resolves to `allow` BEFORE the deny hook can end
    // the turn, so it would execute and earn the second call the fold exists to delete.
    expect(opts?.allowedTools).toBeUndefined();
    // 2, not 1: the deny hook ends the turn at depth 0, and the spare turn is the DEGRADE BUDGET — if that
    // stop ever failed, a ceiling of 1 would answer error_max_turns and take the NARRATIVE down with it.
    expect(opts?.maxTurns).toBe(2);
    expect(opts?.hooks?.PreToolUse).toHaveLength(1);
  });

  test("the PreToolUse hook DENIES + stops the turn for a terminal call, and waves every other tool through", async () => {
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    await runWith(fakeQuery)(terminalReq(castId<ChatId>("chat-hook")));
    const preToolUse = optionsOf(fakeQuery)?.hooks?.PreToolUse ?? [];
    const hook = preToolUse[0]?.hooks[0];
    expect(hook).toBeDefined();
    // The PAIR the runtime turns into `hook_stopped_continuation` → the query loop returns
    // {reason:"hook_stopped"}: `continue:false` alone leaves the loop running, and a deny alone just feeds an
    // error tool_result back to the model — which IS a second model call.
    const stopped = (await hook?.({ hook_event_name: "PreToolUse", tool_name: `${TERMINAL_PREFIX}update_scene`, tool_input: {} })) as {
      continue?: boolean;
      stopReason?: string;
      hookSpecificOutput?: { permissionDecision?: string };
    };
    expect(stopped.continue).toBe(false);
    expect(stopped.stopReason).toBeTruthy();
    expect(stopped.hookSpecificOutput?.permissionDecision).toBe("deny");
    // A REGISTRY tool call is none of this hook's business — it keeps its own SDK-run loop.
    expect(await hook?.({ hook_event_name: "PreToolUse", tool_name: "mcp__orbweaver__tick_clock", tool_input: {} })).toEqual({});
  });

  test("captures the co-emitted calls off the ONE completion — bare names, JSON args, no second call", async () => {
    const fakeQuery = vi.fn(() =>
      streamOf([
        initMsg,
        foldedAssistant([
          { id: "toolu_1", name: `${TERMINAL_PREFIX}update_scene`, input: { targetRef: "user:1", value: "rain" } },
          { id: "toolu_2", name: `${TERMINAL_PREFIX}no_changes`, input: {} },
        ]),
        { ...successResult, stop_reason: "tool_use" },
      ]),
    );
    const result = await runWith(fakeQuery)(terminalReq(castId<ChatId>("chat-fold")));
    // THE assertion: ONE query, one completion, carrying both the prose and the state (the fold's whole win).
    expect(fakeQuery).toHaveBeenCalledOnce();
    expect(result.reply).toBe("She steps into the rain.");
    // The namespace prefix is stripped: the fold matches on the names the game DECLARED, not on SDK vocab.
    expect(result.toolCalls).toEqual([
      { toolCallId: "toolu_1", name: "update_scene", arguments: '{"targetRef":"user:1","value":"rain"}' },
      { toolCallId: "toolu_2", name: "no_changes", arguments: "{}" },
    ]);
    expect(result.finishReason).toBe("tool");
  });

  test("a mounted channel the model never called reports an EMPTY array — a quiet beat, never a missing channel", async () => {
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const result = await runWith(fakeQuery)(terminalReq(castId<ChatId>("chat-quiet")));
    expect(result.toolCalls).toEqual([]);
  });

  test("no terminal tools ⇒ a byte-identical tool-less turn AND an ABSENT channel (the fold falls back)", async () => {
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const { terminalTools: _dropped, ...plain } = terminalReq(castId<ChatId>("chat-plain-terminal"));
    const result = await runWith(fakeQuery)(plain);
    expect(optionsOf(fakeQuery)?.mcpServers).toEqual({});
    expect(optionsOf(fakeQuery)?.maxTurns).toBe(1);
    expect(result.toolCalls).toBeUndefined();
  });

  test("a schema outside the liftable subset mounts NOTHING and reports an absent channel (the loud degrade)", async () => {
    const warn = vi.spyOn(logger, "warn");
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const result = await runWith(fakeQuery)({
      ...terminalReq(castId<ChatId>("chat-unliftable")),
      // `format` is outside the liftable subset — one bad tool withholds the WHOLE mount (a half-mounted state
      // surface would silently lose a plane the model can no longer write).
      terminalTools: [{ name: "update_scene", description: "d", parameters: { type: "object", properties: { at: { type: "string", format: "date" } } } }],
    });
    expect(optionsOf(fakeQuery)?.mcpServers).toEqual({});
    expect(result.toolCalls).toBeUndefined();
    const lines = providerLines(warn, "provider.terminal_tools");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ mounted: false, unliftable: { tool: "update_scene", construct: "format" } });
  });

  test("a TERMINAL denial is the mechanism, not a leak — the firewall tripwire stays silent (a real leak still fires)", async () => {
    const fakeQuery = vi.fn(() =>
      streamOf([initMsg, assistantMsg, { ...successResult, permission_denials: [{ tool_name: `${TERMINAL_PREFIX}update_scene`, tool_use_id: "t1" }] }]),
    );
    const quiet = await runWith(fakeQuery)(terminalReq(castId<ChatId>("chat-denial")));
    expect(quiet.events.filter((e) => e.kind === "permission_leak")).toEqual([]);

    const leaky = vi.fn(() =>
      streamOf([
        initMsg,
        assistantMsg,
        {
          ...successResult,
          permission_denials: [
            { tool_name: `${TERMINAL_PREFIX}update_scene`, tool_use_id: "t1" },
            { tool_name: "Bash", tool_use_id: "t2" },
          ],
        },
      ]),
    );
    const leaked = await runWith(leaky)(terminalReq(castId<ChatId>("chat-leak")));
    expect(leaked.events.filter((e) => e.kind === "permission_leak")).toEqual([{ kind: "permission_leak", at: 0, toolNames: ["Bash"] }]);
  });

  test("rides ALONGSIDE the registry mount + the dynamic-context hook — both mounts and both hooks survive", async () => {
    // The merge is load-bearing: spreading the option fragments would let one `hooks`/`mcpServers` map DELETE
    // the other, silently dropping either the mid-conversation system channel or a whole tool mount.
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const registry = { marker: "registry-mcp" };
    await runWith(fakeQuery)({
      ...terminalReq(castId<ChatId>("chat-both")),
      capability: MID_CONV_CAPABILITY,
      systemPrompt: { static: "STATIC-HALF", dynamic: "DYNAMIC-HALF" },
      params: { advanced: { dynamicContext: "hook" } },
      toolServer: registry,
      toolTurnLimit: 3,
    });
    const opts = optionsOf(fakeQuery);
    expect(opts?.mcpServers).toEqual({ orbweaver: registry, [TERMINAL_NS]: expect.anything() });
    // Only the REGISTRY namespace is allow-listed (the terminal one must stay deniable).
    expect(opts?.allowedTools).toEqual(["mcp__orbweaver__*"]);
    expect(opts?.hooks?.UserPromptSubmit).toHaveLength(1);
    expect(opts?.hooks?.PreToolUse).toHaveLength(1);
    // The registry loop's ceiling wins over the terminal floor (rounds + the final reply).
    expect(opts?.maxTurns).toBe(4);
  });
});

// #1612 — THE MOUNT MAP'S `__proto__` ENTRY SURVIVES ONLY BECAUSE THE COPIES ARE SPREADS. #1405 builds
// external MCP mounts with `Object.fromEntries`, so a caller key `__proto__` becomes an OWN property instead
// of silently setting the object's prototype (the mount would otherwise vanish with nothing red). Every copy
// downstream of that decision has to preserve it, and the two copy forms are NOT equivalent: object spread
// uses CreateDataProperty (own property), where `Object.assign` uses [[Set]] and hands the key to
// `Object.prototype`'s `__proto__` SETTER — which drops it. Nothing on the chat side is caller-keyed today, so
// this is the mechanism's pin rather than an exploit's: it makes the constraint stated at the merge checkable
// instead of hoping the next refactor reads the comment.
/** The merge's own `mcpServers` map type, read off its result (its variadic parameter indexes to `never`): a
 *  hostile entry typed as a REAL server config is the SDK shape the merge would see, never a fabricated cast. */
type MountedMcpServers = NonNullable<ReturnType<typeof mergeMountedOptions>["mcpServers"]>;

describe("mergeMountedOptions — a `__proto__` mount key survives the merge as an own entry", () => {
  test("merging preserves an own `__proto__` key and never moves the prototype", () => {
    const hostile: MountedMcpServers = { ["__proto__"]: { type: "http", url: "https://attacker.example" } };
    const merged = mergeMountedOptions(
      { mcpServers: Object.fromEntries(Object.entries(hostile)) },
      { mcpServers: { orbweaver: { type: "http", url: "https://host.example" } } },
    );
    const servers = merged.mcpServers as Record<string, unknown>;
    expect(Object.hasOwn(servers, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(servers)).toBe(Object.prototype);
    // …and the host's own mount is still there beside it (never replaced, never shadowed).
    expect(Object.hasOwn(servers, "orbweaver")).toBe(true);
  });

  test("the control: `Object.assign` — the form the comment forbids — DROPS it", () => {
    const own = Object.fromEntries([["__proto__", { url: "x" }]]);
    expect(Object.hasOwn(own, "__proto__")).toBe(true);
    // The target is a BINDING, not a literal, on purpose: the lint rule that rewrites `Object.assign({}, x)`
    // into a spread would rewrite this control into the very thing it exists to tell apart.
    const target: Record<string, unknown> = {};
    expect(Object.hasOwn(Object.assign(target, own), "__proto__")).toBe(false);
  });
});
