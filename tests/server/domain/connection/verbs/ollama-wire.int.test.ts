// @subject packages/inference/src/backends/openai-compat/ollama-native.ts
import { setImmediate } from "node:timers/promises";
import type { SummarizeResult } from "@orb/contracts/providers";
import { makeGenerationCapability } from "@orb/testkit/iso/inference-capability.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const MODEL = "qwen2.5:0.5b";
const VALID = { model: MODEL, message: { role: "assistant", content: "A real native answer." }, done: true, ["prompt_eval_count"]: 3, ["eval_count"]: 2 };

async function nativeSummary(value: object): Promise<SummarizeResult> {
  let chatRequests = 0;
  await using root = await createServerHarness({
    providerFetch: (input): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/api/chat") {
        chatRequests += 1;
        return Promise.resolve(
          new Response(`${JSON.stringify(value)}\n`, {
            headers: { "content-type": "application/x-ndjson" },
          }),
        );
      }
      if (url.pathname.endsWith("/models")) {
        return Promise.resolve(Response.json({ data: [{ id: MODEL }] }));
      }
      if (url.pathname === "/api/show") {
        return Promise.resolve(Response.json({ ["model_info"]: {}, capabilities: ["completion"] }));
      }
      if (url.pathname === "/api/ps") {
        return Promise.resolve(Response.json({ models: [] }));
      }
      if (url.pathname === "/api/version") {
        return Promise.resolve(Response.json({ version: "0.12.0" }));
      }
      return Promise.reject(new Error(`unscripted native request: ${url.pathname}`));
    },
  });
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    credentialId: null,
    model: MODEL,
    allowBackground: true,
    declared: { kind: "generation", generation: makeGenerationCapability({ context: { window: 8192 } }) },
  });
  await root.services.connection.setBinding({ principal, task: "summarize", connectionId: row.id });
  const clients = await root.app.roleClientsFor(principal.userId);
  try {
    const work = clients.summarize([{ systemPrompt: "Be terse.", userPrompt: "Answer." }]);
    const state = { settled: false };
    void work.then(
      () => {
        state.settled = true;
      },
      () => {
        state.settled = true;
      },
    );
    for (let turn = 0; !state.settled && turn < 20; turn += 1) {
      await setImmediate();
      root.timers.advance(1000);
    }
    return await work;
  } finally {
    expect(chatRequests).toBeGreaterThan(0);
  }
}

test("native Ollama reply preserves text and accounting", async () => {
  expect(await nativeSummary(VALID)).toMatchObject({
    model: MODEL,
    items: [{ text: VALID.message.content, usage: { tokensIn: 3, tokensOut: 2 } }],
  });
});

test.each([
  { label: "string prompt count", patch: { ["prompt_eval_count"]: "private-count" } },
  { label: "negative completion count", patch: { ["eval_count"]: -1 } },
  { label: "fractional cached count", patch: { ["prompt_eval_cached_count"]: 0.5 } },
  { label: "non-text message", patch: { message: { content: { text: "not native text" } } } },
  { label: "non-boolean terminal", patch: { done: "true" } },
])("malformed native $label refuses instead of manufacturing text or usage", async ({ patch }) => {
  await expect(nativeSummary({ ...VALID, ...patch })).rejects.toMatchObject({
    kind: "unknown",
    retryable: false,
    message: expect.stringContaining("Failed to process successful response"),
  });
});
