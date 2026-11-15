// @subject packages/contracts/src/inference/builtin-providers.ts
// The built-in LiteRouter row against the live service, through the composed root: the add dialog's list read and one
// chat turn that ends with usage. Tagged `live`, so only `E2E_LIVE=1` runs it, and it skips with no
// `LITEROUTER_PROBE_KEY`. It spends a few hundredths of a cent on the cheapest listed model.
import { lookup } from "node:dns/promises";
import process from "node:process";
import { expect, test } from "@orb/testkit/node";
import { createRuntimeRoot, generationCapability, wireConnection } from "../roles/runtime.fixtures.ts";

// biome-ignore lint/style/noProcessEnv: a live provider key the person running the check exports, not application configuration.
const KEY = process.env["LITEROUTER_PROBE_KEY"];
const PROVIDER = "literouter";
// The cheapest chat model the live list carried, with tools and no reasoning.
const MODEL = "ministral-3b-2512";
const MAX_TOKENS = 16;
const LIVE_TIMEOUT_MS = 60_000;

async function resolveHost(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true })).map((entry) => entry.address);
}

test.skipIf(KEY === undefined)(
  "the LiteRouter row lists chat models and runs one turn that ends with usage",
  { tags: ["live"], timeout: LIVE_TIMEOUT_MS },
  async () => {
    const key = KEY ?? "";
    await using root = await createRuntimeRoot({ providerFetch: fetch, networkExecution: { resolver: resolveHost } });
    const listing = await root.services.connection.draftCatalogModels({
      principal: await root.principalFor(root.ownerId),
      providerId: PROVIDER,
      key,
      signal: new AbortController().signal,
    });
    expect(listing.listed).toBe(true);
    const listed = listing.listed ? listing.models.find((model) => model.id === MODEL) : undefined;
    expect(listed).toMatchObject({ id: MODEL });
    expect(listed?.maxCompletionTokens).toBeGreaterThan(0);

    const connection = await wireConnection(root, {
      task: "chat",
      providerId: PROVIDER,
      model: MODEL,
      key,
      capability: generationCapability({ reasoning: { mode: "none", enabled: false } }),
    });
    const turn = await root.app.runtime.executor.runChatTurn({
      api: "chat-completions",
      connection,
      signal: new AbortController().signal,
      params: { maxOutputTokens: MAX_TOKENS },
      systemPrompt: { static: "Answer in two words.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "Say hi." }] }],
    });
    expect(turn.usage.tokensIn).toBeGreaterThan(0);
    expect(turn.usage.tokensOut).toBeGreaterThan(0);
  },
);
