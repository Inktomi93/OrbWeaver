// biome-ignore-all lint/style/useNamingConvention: synthetic SDK message fixtures use the SDK's
// snake_case wire fields (session_id, stop_reason, num_turns, modelUsage, cache_creation, …).
//
// The stream→ChatResult reducer (consumeTurnStream) + the backend factory (createAgentSdkBackend),
// driven by hand-built message streams + an injected fake `query` — no live spawn. Asserts: a success
// stream reduces to a ChatResult (reply/usage/finishReason) and reports the session id once; an error
// result throws a typed ProviderError; the init shape guard fires; and a second turn RESUMES the cached
// session (the Max-sub prompt-cache survival) while a non-agent-sdk request fail-closes.

import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import type { AgentSdkChatRequest, ChatRequest, ChatResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import {
  consumeTurnStream,
  createAgentSdkBackend,
} from "@orb/server/infra/providers/backends/agent-sdk";
import { seedSessionId } from "@orb/server/infra/providers/backends/agent-sdk/session";
import { describe, vi } from "vitest";
import {
  makeModelCapability,
  makeResolvedCredential,
} from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";
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

/** A vLLM (keyless, loopback) credential — avoids touching host `.claude`. */
const VLLM_CRED = makeResolvedCredential("vllm");

const CAPABILITY = makeModelCapability({
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 200_000 },
});

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
function queryOf(
  messages: readonly unknown[],
  getContextUsage: () => Promise<unknown>,
): MessageStream {
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
    await expect(
      consumeTurnStream(streamOf([initMsg, errorResult]), baseCtx),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("the init shape guard fires when session_id is missing", async () => {
    const badInit = { type: "system", subtype: "init", apiKeySource: "oauth" };
    await expect(consumeTurnStream(streamOf([badInit]), baseCtx)).rejects.toThrow(
      MISSING_SESSION_ID_RE,
    );
  });

  test("thinking_tokens frames fill usage.reasoningTokens (running total — last wins)", async () => {
    const thinking = (estimated: number): unknown => ({
      type: "system",
      subtype: "thinking_tokens",
      session_id: SESSION_ID,
      estimated_tokens: estimated,
      estimated_tokens_delta: estimated,
    });
    const result = await consumeTurnStream(
      streamOf([initMsg, thinking(40), assistantMsg, thinking(120), successResult]),
      baseCtx,
    );
    expect(result.usage.reasoningTokens).toBe(120);
  });

  test("a turn with no thinking_tokens frames reports reasoningTokens null", async () => {
    const result = await consumeTurnStream(
      streamOf([initMsg, assistantMsg, successResult]),
      baseCtx,
    );
    expect(result.usage.reasoningTokens).toBeNull();
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
    const result = await consumeTurnStream(
      streamOf([initMsg, refusal, assistantMsg, successResult]),
      { ...baseCtx, onEvent },
    );
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
    const err = await consumeTurnStream(streamOf([initMsg, errorResult]), baseCtx).catch(
      (e: unknown) => e,
    );
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
    const result = await consumeTurnStream(
      streamOf([initMsg, rateLimit, assistantMsg, successResult]),
      { ...baseCtx, onEvent },
    );
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
      permission_denials: [
        { tool_name: "Bash", tool_use_id: "t1", tool_input: { command: "rm -rf" } },
      ],
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
    const result = await consumeTurnStream(
      streamOf([initMsg, assistantMsg, successResult]),
      baseCtx,
    );
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
    const result = await consumeTurnStream(
      streamOf([initMsg, textDelta, assistantMsg, successResult]),
      { ...baseCtx, chatId: "c1", onDelta },
    );
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
    const result = await consumeTurnStream(
      streamOf([initMsg, thinkingDelta, thinkingAssistant, successResult]),
      { ...baseCtx, chatId: "c1", onDelta },
    );
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
    const result = await consumeTurnStream(
      streamOf([initMsg, sigDelta, assistantMsg, successResult]),
      { ...baseCtx, chatId: "c1", onDelta },
    );
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
    const err = await consumeTurnStream(
      streamOf([initMsg, apiRetry, successResult]),
      baseCtx,
    ).catch((e: unknown) => e);
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
    const result = await consumeTurnStream(
      streamOf([initMsg, apiRetry, assistantMsg, successResult]),
      baseCtx,
    );
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
    const err = await consumeTurnStream(
      streamOf([initMsg, rateLimitRetry, errorResult]),
      baseCtx,
    ).catch((e: unknown) => e);
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
    const err = await consumeTurnStream(streamOf([initMsg, rateLimit, errorResult]), baseCtx).catch(
      (e: unknown) => e,
    );
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
    const err = await consumeTurnStream(streamOf([initMsg, errorResult]), baseCtx).catch(
      (e: unknown) => e,
    );
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
    const result = await consumeTurnStream(
      streamOf([initMsg, refusal, assistantMsg, successResult]),
      baseCtx,
    );
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
  function buildReq(chatId: string): AgentSdkChatRequest {
    return {
      api: "agent-sdk",
      prompt: "hi",
      credential: VLLM_CRED,
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
    const fakeQuery = vi.fn((_args: { options?: { resume?: string } }) =>
      streamOf([initMsg, assistantMsg, successResult]),
    );
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    expect(backend.runChatTurn).toBeDefined();
    const run = backend.runChatTurn as ChatTurn;

    const first = await run(buildReq("chat-1"));
    expect(first.reply).toBe("Hello");
    // Turn 1 started fresh (no resume); turn 2 resumes the session id the SDK reported.
    expect(fakeQuery.mock.calls[0]?.[0]?.options?.resume).toBeUndefined();

    await run(buildReq("chat-1"));
    expect(fakeQuery.mock.calls[1]?.[0]?.options?.resume).toBe(SESSION_ID);
  });

  test("a seeded request resumes the DETERMINISTIC seeded session (the PD-7 canon feed)", async () => {
    const fakeQuery = vi.fn((_args: { options?: { resume?: string } }) =>
      streamOf([initMsg, assistantMsg, successResult]),
    );
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    const run = backend.runChatTurn as ChatTurn;
    const seed = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "hi there" },
    ];
    // Turn 1 is a COLD cache (no recorded session) → resumes the deterministic seed-derived id.
    await run({ ...buildReq("chat-seeded"), seed, prompt: "next question" });
    expect(fakeQuery.mock.calls[0]?.[0]?.options?.resume).toBe(seedSessionId("chat-seeded", seed));

    // Turn 1's stream reported session_id=SESSION_ID → recorded. Turn 2's canon DIVERGES (swipe), and
    // the store is replace-capable → reseed IN PLACE under the RECORDED id (keeps the conv cache
    // lineage), NOT a fresh deterministic id.
    const swipeSeed = [...seed, { role: "user" as const, content: "prompt" }];
    await run({ ...buildReq("chat-seeded"), seed: swipeSeed, prompt: "regenerate" });
    expect(fakeQuery.mock.calls[1]?.[0]?.options?.resume).toBe(SESSION_ID);
  });

  test("dynamic-context knob default ('system') JOINS static+dynamic into ONE leak-free systemPrompt string, no hooks", async () => {
    const fakeQuery = vi.fn(
      (_args: {
        options?: { systemPrompt?: string | string[]; hooks?: Record<string, unknown[]> };
      }) => streamOf([initMsg, assistantMsg, successResult]),
    );
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    const run = backend.runChatTurn as ChatTurn;
    await run({
      ...buildReq("chat-sys"),
      systemPrompt: { static: "STATIC-HALF", dynamic: "DYNAMIC-HALF" },
    });
    const opts = fakeQuery.mock.calls[0]?.[0]?.options;
    // buildSystemPrompt JOINS the halves (static\n\ndynamic) — the [static, BOUNDARY, dynamic] array form
    // is forbidden (b1 2026-07-10, SDK 0.3.206: the runtime split is flag-gated OFF → the marker leaks).
    expect(opts?.systemPrompt).toBe("STATIC-HALF\n\nDYNAMIC-HALF");
    expect(opts?.hooks).toBeUndefined();
  });

  test("dynamic-context knob 'hook' sends STATIC-only systemPrompt + injects the dynamic half via a hook", async () => {
    const fakeQuery = vi.fn(
      (_args: { options?: { systemPrompt?: string; hooks?: Record<string, unknown[]> } }) =>
        streamOf([initMsg, assistantMsg, successResult]),
    );
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    const run = backend.runChatTurn as ChatTurn;
    await run({
      ...buildReq("chat-hook"),
      systemPrompt: { static: "STATIC-HALF", dynamic: "DYNAMIC-HALF" },
      params: { advanced: { agentSdkDynamicContext: "hook" } },
    });
    const opts = fakeQuery.mock.calls[0]?.[0]?.options;
    // Static half rides the (cached) system prompt; dynamic half is off it entirely.
    expect(opts?.systemPrompt).toBe("STATIC-HALF");
    // The dynamic half rides a UserPromptSubmit hook (cache-safe injection).
    expect(opts?.hooks?.["UserPromptSubmit"]).toHaveLength(1);
  });

  test("contextUsage: a best-effort getContextUsage probe surfaces on the ChatResult", async () => {
    const getContextUsage = vi.fn(() => Promise.resolve(CONTEXT_USAGE_RESPONSE));
    const fakeQuery = vi.fn(() => queryOf([initMsg, assistantMsg, successResult], getContextUsage));
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    const result = await (backend.runChatTurn as ChatTurn)(buildReq("chat-ctx"));
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
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    const result = await (backend.runChatTurn as ChatTurn)(buildReq("chat-ctx-throw"));
    // The probe failed — contextUsage absent, but the turn is fully intact.
    expect(result.contextUsage).toBeUndefined();
    expect(result.reply).toBe("Hello");
  });

  test("contextUsage: a HANGING probe hits the 2s bound → absent, turn unblocked (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      // A never-resolving getContextUsage — only the bounded timeout can resolve the race.
      const getContextUsage = vi.fn(() => new Promise<never>(() => undefined));
      const fakeQuery = vi.fn(() =>
        queryOf([initMsg, assistantMsg, successResult], getContextUsage),
      );
      const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
      const runPromise = (backend.runChatTurn as ChatTurn)(buildReq("chat-ctx-hang"));
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
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    const result = await (backend.runChatTurn as ChatTurn)(buildReq("chat-no-ctx"));
    expect(result.contextUsage).toBeUndefined();
  });

  test("options.title is the chatId-derived METADATA label (orb:<chatId>), never the user's chat title", async () => {
    const fakeQuery = vi.fn((_args: { options?: { title?: string } }) =>
      streamOf([initMsg, assistantMsg, successResult]),
    );
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    await (backend.runChatTurn as ChatTurn)(buildReq("chat-titled"));
    expect(fakeQuery.mock.calls[0]?.[0]?.options?.title).toBe("orb:chat-titled");
  });

  test("a non-agent-sdk request fail-closes with a typed ProviderError", async () => {
    const backend = createAgentSdkBackend({ now: () => 0, query: vi.fn() as never });
    expect(backend.runChatTurn).toBeDefined();
    const run = backend.runChatTurn as ChatTurn;
    const wrongApi = { api: "chat-completions" } as unknown as ChatRequest;
    await expect(run(wrongApi)).rejects.toBeInstanceOf(ProviderError);
  });

  test("surfaces a resolve-chat dropped knob as a `warning` event (in events AND via onEvent)", async () => {
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({ now: () => FIXED_NOW, query: fakeQuery as never });
    const run = backend.runChatTurn as ChatTurn;
    const onEvent = vi.fn();
    // CAPABILITY (reasoning none, sampling {}) exposes no temperature range → resolve-chat drops it + warns.
    const result = await run({ ...buildReq("chat-warn"), params: { temperature: 0.7 }, onEvent });
    const warnings = result.events.filter((e) => e.kind === "warning");
    expect(warnings).toEqual([
      {
        kind: "warning",
        at: FIXED_NOW,
        code: "sampling_knob_dropped",
        message: "temperature ignored: model does not expose a temperature range",
      },
    ]);
    expect(onEvent).toHaveBeenCalledWith(warnings[0]);
  });
});

describe("provider.* observability taxonomy", () => {
  function buildReq(chatId: string): AgentSdkChatRequest {
    return {
      api: "agent-sdk",
      prompt: "hi",
      credential: VLLM_CRED,
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
      chatId: "chat-1",
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
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    await (backend.runChatTurn as ChatTurn)(buildReq("chat-ctx-log"));
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
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    const run = backend.runChatTurn as ChatTurn;
    const seed = [{ role: "user" as const, content: "hello" }];
    await run({ ...buildReq("chat-sess"), seed });
    const sessions = providerLines(debug, "provider.session");
    expect(sessions).toHaveLength(1);
    expect((sessions[0] as Record<string, unknown>)["disposition"]).toBe("seeded");
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
    const backend = createAgentSdkBackend({ now: () => 0, query: explodingQuery as never });
    const run = backend.runChatTurn as ChatTurn;
    await run(buildReq("chat-death")).catch(() => undefined);
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
    const healthy = createAgentSdkBackend({ now: () => 0, query: healthyQuery as never });
    await (healthy.runChatTurn as ChatTurn)(buildReq("chat-ok"));
    expect(providerLines(error, "provider.error")).toHaveLength(0);
  });
});
