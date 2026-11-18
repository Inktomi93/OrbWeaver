// The vendor's per-generation fingerprint (`system_fingerprint`) reaches the turn record, on a HYPHENATED row id.
// The openai-compatible SDK files `providerMetadata` under `resolveProviderOptionsKey(name, providerOptions)` — the
// camel form whenever the caller wrote the camel form (which our body shaper always does), so a fold that reads the
// raw row id finds nothing on `custom-openai`. This case is the hyphenated id that proves write and read share one
// derivation.
// @subject packages/inference/src/backends/openai-compat/model.ts
// @subject packages/inference/src/backends/v4/result.ts

import type { ProviderId } from "@orb/contracts/inference";
import { providerIdSchema } from "@orb/contracts/inference";
import type { ChatHistoryMessage, ChatResult } from "@orb/inference";
import { expect, test } from "@orb/testkit/node";
import type { OpenAiReply, RecordedRequest } from "@orb/testkit/node/helpers";
import { openAiServer } from "@orb/testkit/node/helpers";
import { createRuntimeRoot, generationCapability, wireConnection } from "../../roles/runtime.fixtures.ts";

type Connection = Omit<Parameters<typeof wireConnection<"chat">>[1], "task" | "model" | "providerId"> & {
  readonly providerId?: ProviderId;
  readonly model?: string;
};

const SYSTEM_TEXT = "You are a fixture.";
const USER_LINE: ChatHistoryMessage = { role: "user", content: [{ type: "text", text: "Hello." }] };
const FINGERPRINT = "fp_fixture_2f8a1c";

/** One chat turn against a wire that answers with `answer`; the folded record comes back whole. */
async function send(row: Connection, answer: OpenAiReply): Promise<ChatResult> {
  const recorded: RecordedRequest[] = [];
  using server = openAiServer(recorded, () => answer);
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, {
    ...row,
    task: "chat",
    providerId: row.providerId ?? "custom-openai",
    model: row.model ?? "fingerprint-model",
  });
  return await root.app.runtime.executor.runChatTurn({
    signal: new AbortController().signal,
    api: "chat-completions",
    connection,
    params: {},
    systemPrompt: { static: SYSTEM_TEXT, dynamic: "" },
    history: [USER_LINE],
  });
}

test("a hyphenated row id carries the vendor's system_fingerprint into the turn record", async () => {
  // Red-proof: the extractor did not exist, so this field read `undefined` on every wire — and once it did, a fold
  // keyed on the raw row id (`custom-openai`) still found nothing, because the SDK files the bag under `customOpenai`.
  const turn = await send({}, { fingerprint: FINGERPRINT });
  expect(turn.reply).toBe("ok");
  expect(turn.systemFingerprint).toBe(FINGERPRINT);
});

test("a row id with no separator reports its fingerprint too — the derivation is not a hyphen special case", async () => {
  const openai: ProviderId = providerIdSchema.parse("openai");
  const turn = await send({ providerId: openai }, { fingerprint: FINGERPRINT });
  expect(turn.reply).toBe("ok");
  expect(turn.systemFingerprint).toBe(FINGERPRINT);
});

test("a wire that reports no fingerprint records none — absence is not a fabricated value", async () => {
  // Positive control in the same case: the turn ran and its reply landed. Only the fingerprint is absent.
  const turn = await send({ capability: generationCapability() }, {});
  expect(turn.reply).toBe("ok");
  expect(turn.systemFingerprint).toBeNull();
});
