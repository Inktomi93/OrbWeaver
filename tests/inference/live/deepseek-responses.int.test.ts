// @subject packages/inference/src/backends/openai-compat/responses.ts
// The revived `/responses` protocol against the live DeepSeek service through the composed root — the
// money path the deterministic fetch-seam suite cannot prove: the vendor's REAL `response.reasoning_text.*`
// dialect folding into reasoning deltas, and a forced tool round with thinking off. Tagged `live`, so only
// `E2E_LIVE=1` runs it, and it skips with no `DEEPSEEK_PROBE_KEY`. It spends fractions of a cent.

import { lookup } from "node:dns/promises";
import process from "node:process";
import { expect, test } from "@orb/testkit/node";
import { createRuntimeRoot, generationCapability, wireConnection } from "../roles/runtime.fixtures.ts";

// biome-ignore lint/style/noProcessEnv: a live provider key the person running the check exports, not application configuration.
const KEY = process.env["DEEPSEEK_PROBE_KEY"];
const LIVE_TIMEOUT_MS = 240_000;

async function resolveHost(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true })).map((entry) => entry.address);
}

test.skipIf(KEY === undefined)(
  "a live reasoned turn folds the vendor's raw reasoning dialect into reasoning deltas",
  { tags: ["live"], timeout: LIVE_TIMEOUT_MS },
  async () => {
    await using root = await createRuntimeRoot({ providerFetch: fetch, networkExecution: { resolver: resolveHost } });
    const connection = await wireConnection(root, {
      task: "chat",
      providerId: "deepseek",
      model: "deepseek-v4-pro",
      api: "responses",
      key: KEY ?? "",
      capability: generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["medium", "max"] } }),
    });
    const turn = await root.app.runtime.executor.runChatTurn({
      api: "responses",
      connection,
      signal: new AbortController().signal,
      params: { effort: "medium", maxOutputTokens: 600 },
      systemPrompt: { static: "Show the multiplication, then state the product.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "What is 17*23? Think it through." }] }],
    });
    // The vendor streams `response.reasoning_text.delta` frames the SDK models only as summary events;
    // non-empty reasoning text on the result means the dialect rewriter folded the real stream.
    expect(turn.reasoning.length).toBeGreaterThan(0);
    expect(turn.appliedEffort).toBe("medium");
    expect(turn.reply).toContain("391");
    expect(turn.usage.tokensIn).toBeGreaterThan(0);
    expect(turn.usage.tokensOut).toBeGreaterThan(0);
  },
);

test.skipIf(KEY === undefined)(
  "a live forced-tool round rides `effort: none` and returns the vendor's call (thinking-off makes the required choice legal)",
  { tags: ["live"], timeout: LIVE_TIMEOUT_MS },
  async () => {
    await using root = await createRuntimeRoot({ providerFetch: fetch, networkExecution: { resolver: resolveHost } });
    const connection = await wireConnection(root, {
      task: "chat",
      providerId: "deepseek",
      model: "deepseek-v4-pro",
      api: "responses",
      key: KEY ?? "",
      capability: generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["medium", "max"] } }),
    });
    const turn = await root.app.runtime.executor.runChatTurn({
      api: "responses",
      connection,
      signal: new AbortController().signal,
      params: { effort: "none", maxOutputTokens: 300 },
      systemPrompt: { static: "Use the tool for any weather question.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "What is the weather in Oslo?" }] }],
      tools: [
        {
          name: "get_weather",
          description: "Weather for a city.",
          parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
        },
      ],
      toolChoice: { mode: "required" },
    });
    const call = turn.toolCalls?.[0];
    expect(call?.name).toBe("get_weather");
    expect(JSON.stringify(call?.arguments)).toContain("Oslo");
  },
);
