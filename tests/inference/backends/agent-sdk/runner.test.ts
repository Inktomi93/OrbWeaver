// tests/inference/backends/agent-sdk/runner — `consumeTurnStream` over hand-built SDK frames.
//
// The failure frames below are the bundled runtime's own output, captured from a live CLI run and trimmed to
// the fields the reducer reads: a `success` result flagged `is_error`, preceded by a synthetic assistant
// message that names the SDK error code. The reducer must classify from that code and the upstream status;
// reporting every such turn as a retryable `server` fault tells the user to "try again" for a model the
// runtime will never serve.

import { modelIdSchema } from "@orb/contracts/inference";
import { createAgentSdkLog } from "../../../../packages/inference/src/backends/agent-sdk/log.ts";
import { consumeTurnStream } from "../../../../packages/inference/src/backends/agent-sdk/runner.ts";
import type { TurnStreamContext } from "../../../../packages/inference/src/backends/agent-sdk/types.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";

type SdkStream = Parameters<typeof consumeTurnStream>[0];
type SdkFrame = SdkStream extends AsyncIterable<infer M> ? M : never;

const SESSION_ID = "898b4849-1607-4179-bcc2-56b45e572385";
const REQUEST_ID = "req_011CfKngp5U5e19DzkY91H9Z";
const CLI_TOO_OLD =
  "API Error: 400 Claude Code 2.1.216 does not support this model; version 2.1.280 or newer is required. Run 'claude update', or update the Claude desktop app, then try again.";
const MODEL_MISSING =
  "There's an issue with the selected model (claude-opus-9-9). It may not exist or you may not have access to it. Run --model to pick a different model.";

const quietLog: InferenceLog = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

function ctx(model: string): TurnStreamContext {
  return { model: modelIdSchema.parse(model), providerId: "claude-sub", resumed: false, now: () => 0, appliedEffort: null };
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

async function failureOf(stream: SdkStream, model: string): Promise<ProviderError> {
  const outcome = await consumeTurnStream(stream, ctx(model), createAgentSdkLog(quietLog, "claude-sub")).then(
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
  // `invalid` is the kind whose own message reaches the user, so the reason must be in it.
  expect(error.message).toContain("version 2.1.280 or newer is required");
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
