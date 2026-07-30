// verb: getModelCapability — resolves the descriptor through the substrate mediator. Curated id needs no
// cache; an OR id reads the seeded TTL cache for synthesis.

import { createConnectionService } from "@orb/server/domain/connection";
import { deriveTrackersReadOnly } from "@orb/server/domain/rpg";
import { afterEach, describe } from "vitest";
import { writeAgentSdkCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/agent-sdk-catalog-snapshot.ts";
import { writeCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/catalog-snapshot.ts";
import { __resetAgentSdkModelCache, getCachedAgentSdkModels } from "../../../../../packages/server/src/domain/connection/substrate/agent-sdk-model-cache.ts";
import { __resetOrModelCache, getCachedOrModels, seedOrModelCache } from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeAgentSdkModel, makeConnHarness, makeOrEntry } from "../_support.ts";

const MS_PER_HOUR = 3_600_000;

afterEach(() => {
  __resetOrModelCache();
  __resetAgentSdkModelCache();
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

  // Regression (cold-cache capability loss): a restart clears the in-memory mirror, and the daily refresh
  // cadence won't re-warm it for up to a day. The boot-seed (getCatalog reads the persisted snapshot) must
  // restore capability, and the mirror must NOT expire the hours/day-old snapshot (the old 1h TTL did).
  test("cold mirror + persisted snapshot ⇒ boot-seed restores a NON-curated OR model's structured/tools", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    const svc = createConnectionService(h.ctx);

    // sonnet-4.5 is NOT on the curated shortlist (only 4-6/5 are), so it MUST resolve through OR catalog
    // synthesis — the real subject this fix restores. It advertises structured_outputs + tools on OR.
    const model = "anthropic/claude-sonnet-4.5";
    // The last daily refresh landed 2h ago — past the OLD 1h TTL, so this pins the enlarged ceiling too.
    const fetchedAt = h.clock.now() - 2 * MS_PER_HOUR;
    await writeCatalogSnapshot(db, {
      fetchedAt,
      models: [makeOrEntry({ id: model, name: "Claude Sonnet 4.5", supportedParameters: ["temperature", "top_p", "structured_outputs", "tools"] })],
    });

    // Simulate a restart: the module-scope mirror is cold and getCatalog has not run yet.
    __resetOrModelCache();
    expect(getCachedOrModels(h.clock.now())).toBeNull();

    // Boot-seed (entry/lifecycle calls this on startup) — warms the mirror from the persisted snapshot.
    await svc.getCatalog({});

    const cap = await svc.getModelCapability({ model, source: "openrouter", api: "chat-completions" });
    expect(cap.output.structured).toBe(true);
    expect(cap.tools).toBeDefined();
    // The RPG reliable-mode extraction gate: a structured-capable host is NOT trackers-readonly (extraction
    // runs). Cold cache used to yield structured:undefined ⇒ readonly true ⇒ the empty-rpg-panel bug.
    expect(deriveTrackersReadOnly("reliable", cap)).toBe(false);
  });

  // Sibling regression (agent-sdk cold-cache capability loss): the SEPARATE agent-sdk daemon mirror has the
  // same 1h-TTL/no-boot-seed defect. A restart clears it and the daily refresh won't re-warm for up to a day.
  // getAgentSdkCatalog (entry/lifecycle calls it on startup) must restore the daemon rows, and the mirror must
  // NOT expire the hours/day-old snapshot — else a bare max-pro-sub alias degrades to no-reasoning.
  test("cold agent-sdk mirror + persisted snapshot ⇒ boot-seed restores a bare alias's daemon reasoning", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    const svc = createConnectionService(h.ctx);

    // A bare family alias ("sonnet") is NOT a curated id, so it resolves through the daemon map — the real
    // subject this fix restores. The daemon advertises adaptive thinking for it.
    const alias = "sonnet";
    // The last daily refresh landed 2h ago — past the OLD 1h TTL, so this pins the enlarged ceiling too.
    const fetchedAt = h.clock.now() - 2 * MS_PER_HOUR;
    await writeAgentSdkCatalogSnapshot(db, {
      fetchedAt,
      models: [makeAgentSdkModel({ alias, resolvedModel: "claude-sonnet-5", supportsAdaptiveThinking: true })],
    });

    // Simulate a restart: the module-scope mirror is cold and getAgentSdkCatalog has not run yet.
    __resetAgentSdkModelCache();
    expect(getCachedAgentSdkModels(h.clock.now())).toBeNull();

    // Boot-seed (entry/lifecycle calls this on startup) — warms the mirror from the persisted snapshot.
    await svc.getAgentSdkCatalog({});
    expect(getCachedAgentSdkModels(h.clock.now())).not.toBeNull();

    const cap = await svc.getModelCapability({ model: alias, source: "max-pro-sub", api: "agent-sdk" });
    // Cold cache used to yield resolveAgentSdkAlias undefined ⇒ the conservative staticProfile ⇒ mode "none".
    expect(cap.reasoning.mode).toBe("adaptive");
  });
});
