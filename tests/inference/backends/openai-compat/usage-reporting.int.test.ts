// What the terminal usage frame REPORTS is what the usage record carries, on every openai-compat row.
// The compatible SDK's default usage mapper never reads `cache_write_tokens` (`@ai-sdk/openai-compatible`
// dist index.js:40-60 spells `cacheWrite: void 0`) and coerces absent axes to zero; the retired
// `nativeOpenAiUsageOverlay` re-read the raw bytes but only on `providerId === "openai"` rows with the
// `openai-breakpoint` spelling, so any OTHER endpoint reporting the axis reported zero. `convertUsage`
// (dist index.js:372-373) is the SDK's own conversion path and it runs for every row this factory serves.
// @subject packages/inference/src/backends/openai-compat/usage.ts
// @subject packages/inference/src/backends/openai-compat/model.ts

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

/** One chat turn whose terminal frame answers with `usage`; the reported turn comes back whole. */
async function send(row: Connection, usage: OpenAiReply["usage"]): Promise<ChatResult> {
  const recorded: RecordedRequest[] = [];
  using server = openAiServer(recorded, () => (usage === undefined ? {} : { usage }));
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, { ...row, task: "chat", providerId: row.providerId ?? "custom-openai", model: row.model ?? "usage-model" });
  return await root.app.runtime.executor.runChatTurn({
    signal: new AbortController().signal,
    api: "chat-completions",
    connection,
    params: {},
    systemPrompt: { static: SYSTEM_TEXT, dynamic: "" },
    history: [USER_LINE],
  });
}

test("a vendor-reported cache_write_tokens reaches the usage record on a NON-openai row — the default mapper drops the axis", async () => {
  // Red-proof: before `convertUsage` was adopted this row folded `cacheWriteTokens: 0` — the default
  // mapper never reads the field, and the raw re-read was gated to `providerId === "openai"`. The other
  // four assertions are the positive control that the frame itself reached the fold.
  const turn = await send({}, { prompt: 1000, completion: 40, cached: 800, cacheWrite: 256, reasoning: 16 });
  expect(turn.usage.tokensIn).toBe(1000);
  expect(turn.usage.tokensOut).toBe(40);
  expect(turn.usage.cacheReadTokens).toBe(800);
  expect(turn.usage.cacheWriteTokens).toBe(256);
  expect(turn.usage.reasoningTokens).toBe(16);
});

test("the curated openai spelling keeps what the retired overlay read, beside the axes the default already carried", async () => {
  // The overlay's old home: a row with the `openai-breakpoint` format on `providerId === "openai"`.
  // Deleting the overlay must not lose the axis there — same vendor bytes, same numbers.
  const openai: ProviderId = providerIdSchema.parse("openai");
  const breakpoint = generationCapability({
    turns: {
      assistantPrefill: false,
      midConversationSystem: false,
      historySystemRows: false,
      roleHandlingFloor: "strict",
      explicitPromptCache: false,
      promptCacheFormat: "openai-breakpoint",
    },
  });
  const turn = await send({ providerId: openai, capability: breakpoint }, { prompt: 5000, completion: 20, cached: 4864, cacheWrite: 128, reasoning: 8 });
  expect(turn.usage.cacheWriteTokens).toBe(128);
  expect(turn.usage.cacheReadTokens).toBe(4864);
  expect(turn.usage.tokensIn).toBe(5000);
  expect(turn.usage.tokensOut).toBe(20);
  expect(turn.usage.reasoningTokens).toBe(8);
});

test("an axis the frame does not carry stays absent: reasoning folds null, the cache axes take the fold's no-cache zero", async () => {
  // The null-vs-zero discipline the overlay held and the default mapper violated (`prompt_tokens ?? 0`,
  // `reasoning_tokens ?? 0`): a frame that names no `completion_tokens_details` reports no reasoning —
  // that is `null` (unknown), not a fabricated 0. The cache axes are the FOLD's documented rule
  // ("a wire that reports no cache has none", contracts/inference/usage.ts foldTokenUsage), so 0 is the
  // answer the law gives — the positive control beside it proves the frame still rode.
  const turn = await send({}, { prompt: 300, completion: 12 });
  expect(turn.usage.tokensIn).toBe(300);
  expect(turn.usage.tokensOut).toBe(12);
  expect(turn.usage.reasoningTokens).toBeNull();
  expect(turn.usage.cacheReadTokens).toBe(0);
  expect(turn.usage.cacheWriteTokens).toBe(0);
});
