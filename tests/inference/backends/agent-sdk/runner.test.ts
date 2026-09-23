// tests/inference/backends/agent-sdk/runner — `consumeTurnStream` over hand-built SDK frames.
//
// The failure frames below are the bundled runtime's own output, captured from a live CLI run and trimmed to
// the fields the reducer reads: a `success` result flagged `is_error`, preceded by a synthetic assistant
// message that names the SDK error code. The reducer must classify from that code and the upstream status;
// reporting every such turn as a retryable `server` fault tells the user to "try again" for a model the
// runtime will never serve.

import { modelIdSchema } from "@orb/contracts/inference";
import { createAgentSdkLog } from "../../../../packages/inference/src/backends/agent-sdk/log.ts";
import { consumeTurnStream, runChatTurn } from "../../../../packages/inference/src/backends/agent-sdk/runner.ts";
import { SessionCache } from "../../../../packages/inference/src/backends/agent-sdk/session/store.ts";
import type { AgentSdkDeps, TurnStreamContext } from "../../../../packages/inference/src/backends/agent-sdk/types.ts";
import { passthroughImageNormalizer } from "../../../../packages/inference/src/backends/kit/image-normalize.ts";
import { resolvedScrubSet } from "../../../../packages/inference/src/backends/kit/sanitize.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeResolved } from "../../_support.ts";
import { generationCapability } from "../_hosted-support.ts";

type SdkStream = Parameters<typeof consumeTurnStream>[0];
type SdkFrame = SdkStream extends AsyncIterable<infer M> ? M : never;

const SESSION_ID = "898b4849-1607-4179-bcc2-56b45e572385";
const REQUEST_ID = "req_011CfKngp5U5e19DzkY91H9Z";
const CLI_TOO_OLD =
  "API Error: 400 Claude Code 2.1.216 does not support this model; version 2.1.280 or newer is required. Run 'claude update', or update the Claude desktop app, then try again.";
const MODEL_MISSING =
  "There's an issue with the selected model (claude-opus-9-9). It may not exist or you may not have access to it. Run --model to pick a different model.";

const quietLog: InferenceLog = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
/** The subscription token the spawn ran under — the one literal a failure message must never carry. */
const TOKEN = "sk-ant-oat01-wirefixesprobetokennotreal";

function ctx(model: string): TurnStreamContext {
  return {
    model: modelIdSchema.parse(model),
    providerId: "claude-sub",
    resumed: false,
    now: () => 0,
    appliedEffort: null,
    secrets: resolvedScrubSet({ credential: { secret: TOKEN }, transport: null }),
  };
}

/** The runtime's synthetic API-error turn: an assistant frame carrying the SDK error code, then a `success`
 *  result flagged `is_error` with the upstream status. */
function apiErrorTurn(args: { readonly model: string; readonly code: string; readonly status: number; readonly text: string }): SdkStream {
  const frames = [
    { type: "system", subtype: "init", session_id: SESSION_ID, apiKeySource: "none", model: args.model },
    {
      type: "assistant",
      session_id: SESSION_ID,
      parent_tool_use_id: null,
      error: args.code,
      request_id: REQUEST_ID,
      message: { model: "<synthetic>", role: "assistant", stop_reason: "stop_sequence", content: [{ type: "text", text: args.text }] },
    },
    {
      type: "result",
      subtype: "success",
      session_id: SESSION_ID,
      is_error: true,
      api_error_status: args.status,
      duration_api_ms: 0,
      num_turns: 1,
      result: args.text,
      stop_reason: "stop_sequence",
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
      terminal_reason: "api_error",
    },
  ];
  async function* gen(): AsyncGenerator<SdkFrame> {
    await Promise.resolve();
    for (const frame of frames) {
      // @orb-waive no-test-fabrication(unknown): the frames are the CLI's captured output trimmed to what the reducer reads; the SDK frame types carry many unrelated required fields. Ends if the SDK exports a frame factory.
      yield frame as unknown as SdkFrame;
    }
  }
  return gen();
}

async function failureOf(stream: SdkStream, model: string, log: InferenceLog = quietLog): Promise<ProviderError> {
  const outcome = await consumeTurnStream(stream, ctx(model), createAgentSdkLog(log, "claude-sub")).then(
    () => null,
    (error: unknown) => error,
  );
  if (!(outcome instanceof ProviderError)) {
    throw new Error(`expected a ProviderError, got ${String(outcome)}`);
  }
  return outcome;
}

test("a runtime too old for the model is a non-retryable invalid request that carries the runtime's own reason", async () => {
  const error = await failureOf(apiErrorTurn({ model: "claude-opus-5-5", code: "unknown", status: 400, text: CLI_TOO_OLD }), "claude-opus-5-5");
  expect(error.kind).toBe("invalid");
  expect(error.retryable).toBe(false);
  expect(error.apiErrorStatus).toBe(400);
  expect(error.terminalReason).toBe("api_error");
  expect(error.requestId).toBe(REQUEST_ID);
  // `invalid` is the kind whose own message reaches the user, so the reason must be in it — as the runtime's
  // own words, without our internal label.
  expect(error.message).toBe(CLI_TOO_OLD);
});

// `invalid` carries its own message to the user (`transport/trpc/error-mapping.ts`), and every upstream-derived
// message must be `sanitizeApiError(redactSecretsFromText(…))`. The verifier's input: an HTML error page with
// terminal control bytes and a 3000-char tail, echoed through the runtime's `result` text.
const HOSTILE = `API Error: 400 <html><body><h1>Bad Request</h1><script>x()</script></body></html>\u0007\u001b[31m${"A".repeat(3000)}`;

test("the runtime's failure text is sanitized before it becomes a user-facing message", async () => {
  const error = await failureOf(apiErrorTurn({ model: "claude-opus-5-5", code: "invalid_request", status: 400, text: HOSTILE }), "claude-opus-5-5");
  expect(error.kind).toBe("invalid");
  expect(error.message).not.toContain("<html>");
  expect(error.message).not.toContain("<script>");
  expect(error.message).not.toContain("\u0007");
  expect(error.message).not.toContain("\u001b");
  expect(error.message.length).toBeLessThan(600);
  expect(error.message.startsWith("API Error: 400 Bad Request")).toBe(true);
});

test("a token the runtime echoes never reaches the message, including the revoking auth_failed kind", async () => {
  const leak = `Invalid bearer token: ${TOKEN} (Authorization: Bearer ${TOKEN})`;
  for (const [code, status] of [
    ["authentication_failed", 401],
    ["invalid_request", 400],
  ] as const) {
    const error = await failureOf(apiErrorTurn({ model: "claude-opus-5", code, status, text: leak }), "claude-opus-5");
    expect(error.message, code).not.toContain(TOKEN);
    expect(error.message, code).not.toContain("wirefixesprobetoken");
  }
});

test("the internal label stays in the operator log, off the user's message", async () => {
  const lines: Record<string, unknown>[] = [];
  const recording: InferenceLog = { ...quietLog, error: (fields) => lines.push({ ...fields }) };
  const error = await failureOf(apiErrorTurn({ model: "claude-opus-5-5", code: "unknown", status: 400, text: CLI_TOO_OLD }), "claude-opus-5-5", recording);
  expect(error.message.startsWith("agent-sdk:")).toBe(false);
  expect(lines.map((line) => line["label"])).toContain("agent-sdk: turn failed (http_400)");
});

test("a model the runtime cannot find is model_unavailable, not a transient server fault", async () => {
  const error = await failureOf(apiErrorTurn({ model: "claude-opus-9-9", code: "model_not_found", status: 404, text: MODEL_MISSING }), "claude-opus-9-9");
  expect(error.kind).toBe("model_unavailable");
  expect(error.retryable).toBe(false);
  expect(error.detail).toBe("model_not_found");
  expect(error.apiErrorStatus).toBe(404);
});

test("an is_error result the runtime attributes to an overloaded upstream stays retryable", async () => {
  const error = await failureOf(apiErrorTurn({ model: "claude-opus-5", code: "overloaded", status: 529, text: "API Error: 529 Overloaded" }), "claude-opus-5");
  expect(error.kind).toBe("server");
  expect(error.retryable).toBe(true);
});

// ── the wire capture must show what the model got ────────────────────────────────────────────────────────
// On a model whose dynamic context rides the `UserPromptSubmit` hook (opus-4-8 on agent-sdk), a lifted system
// injection reaches the model only through that hook. The capture recorded the prompt and the static system
// prompt alone, so a rule the model obeyed was absent from `/api/_debug/wire/captures` (matrix defect 12).

const HOOK_RULE = "End your reply with the exact token ORB-7731.";

function okTurn(model: string): unknown[] {
  return [
    { type: "system", subtype: "init", session_id: SESSION_ID, apiKeySource: "none", model },
    {
      type: "assistant",
      session_id: SESSION_ID,
      parent_tool_use_id: null,
      message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
    },
    {
      type: "result",
      subtype: "success",
      session_id: SESSION_ID,
      is_error: false,
      duration_api_ms: 1,
      num_turns: 1,
      result: "ok",
      usage: {},
      modelUsage: {},
      terminal_reason: "completed",
    },
  ];
}

async function capturedBody(midConversationSystem: boolean): Promise<Record<string, unknown>> {
  const model = "claude-opus-4-8";
  const captured: Record<string, unknown>[] = [];
  const connection = fakeResolved({
    task: "chat",
    providerId: "claude-sub",
    model,
    capability: generationCapability({
      turns: { assistantPrefill: false, midConversationSystem, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: true },
    }),
  });
  const sessions = new SessionCache(quietLog);
  const frames = okTurn(model);
  const deps: AgentSdkDeps = {
    now: () => 0,
    log: quietLog,
    // @orb-waive no-test-fabrication(unknown): the SDK `query` seam returns its own `Query` object; the reducer only iterates it, so a generator over captured-shape frames is the honest double. Ends if the SDK exports a query fake.
    query: (() =>
      (async function* stream(): AsyncGenerator<unknown> {
        await Promise.resolve();
        yield* frames;
      })()) as unknown as AgentSdkDeps["query"],
    sessionStore: sessions.store,
    normalizeImageBytes: passthroughImageNormalizer,
    scheduleTimeout: () => () => undefined,
    summarizeConcurrency: () => 1,
    captureWire: (entry) => {
      captured.push(entry.body);
    },
    debug: false,
    childEnv: () => ({}),
  };
  await runChatTurn(
    { api: "agent-sdk", connection, params: {}, systemPrompt: { static: "You are Mara.", dynamic: HOOK_RULE }, prompt: "Hello." },
    deps,
    sessions,
    createAgentSdkLog(quietLog, "claude-sub"),
  );
  const [body] = captured;
  if (body === undefined) {
    throw new Error("the turn captured nothing");
  }
  return body;
}

test("the capture records the hook channel's context when the dynamic context rides the hook", async () => {
  const body = await capturedBody(true);
  expect(body["systemPrompt"]).toBe("You are Mara.");
  expect(body["hookContext"]).toBe(HOOK_RULE);
});

test("the capture records no hook context when the dynamic context joins the system prompt", async () => {
  const body = await capturedBody(false);
  expect(body["systemPrompt"]).toBe(`You are Mara.\n\n${HOOK_RULE}`);
  expect(body["hookContext"]).toBeNull();
});
