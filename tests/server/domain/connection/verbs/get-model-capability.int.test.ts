// verb: getModelCapability — resolves the descriptor through the substrate mediator. Curated id needs no
// cache; an OR id reads the seeded TTL cache for synthesis.

import { createConnectionService } from "@orb/server/domain/connection";
import { afterEach, describe } from "vitest";
import { __resetOrModelCache, seedOrModelCache } from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeConnHarness, makeOrEntry } from "../_support.ts";

afterEach(() => {
  __resetOrModelCache();
});

describe("getModelCapability", () => {
  test("a curated id returns the curated descriptor (no cache needed)", async () => {
    const svc = createConnectionService(makeConnHarness(await freshDb()).ctx);
    const cap = await svc.getModelCapability({
      model: "claude-opus-4-8",
      source: "max-pro-sub",
      api: "agent-sdk",
    });
    expect(cap.reasoning.mode).toBe("adaptive");
  });

  test("an OR id synthesizes from the seeded TTL cache", async () => {
    const h = makeConnHarness(await freshDb());
    seedOrModelCache([makeOrEntry({ id: "openai/gpt-5", supportedParameters: ["temperature", "top_k"] })], h.clock.now());
    const svc = createConnectionService(h.ctx);

    const cap = await svc.getModelCapability({
      model: "openai/gpt-5",
      source: "openrouter",
      api: "chat-completions",
    });
    expect(cap.sampling.topK).toEqual({ min: 0, max: 200 });
  });
});
