// verb: getOrSkinTierModels — the front-door that DERIVES the mode-2 OR-skin tier→slug map from the two
// live TTL caches (agent-sdk daemon map + OR catalog). Replaces the hardcoded map that used to live in the
// env firewall. Proves: a warm daemon+OR pair yields the daemon-current slugs; a cold cache degrades to the
// curated shortlist (never throws). The transform/fallback UNIT coverage is the catalog test; here we lock
// the SEAM (both caches read with `ctx.now()`, threaded to the derivation).

import { createConnectionService } from "@orb/server/domain/connection";
import { afterEach, describe } from "vitest";
import { __resetAgentSdkModelCache, seedAgentSdkModelCache } from "../../../../../packages/server/src/domain/connection/substrate/agent-sdk-model-cache.ts";
import { __resetOrModelCache, seedOrModelCache } from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeAgentSdkModel, makeConnHarness, makeOrEntry } from "../_support.ts";

afterEach(() => {
  __resetOrModelCache();
  __resetAgentSdkModelCache();
});

/** The three base anthropic OR ids the derivation resolves the tier families against. */
function seedOrCatalog(now: number): void {
  seedOrModelCache(
    [makeOrEntry({ id: "anthropic/claude-opus-4.8" }), makeOrEntry({ id: "anthropic/claude-sonnet-5" }), makeOrEntry({ id: "anthropic/claude-haiku-4.5" })],
    now,
  );
}

describe("getOrSkinTierModels", () => {
  test("a warm daemon + OR pair derives the daemon-current tier slugs", async () => {
    const h = makeConnHarness(await freshDb());
    seedOrCatalog(h.clock.now());
    seedAgentSdkModelCache(
      [
        makeAgentSdkModel({ alias: "opus", resolvedModel: "claude-opus-4-8" }),
        makeAgentSdkModel({ alias: "sonnet", resolvedModel: "claude-sonnet-5" }),
        makeAgentSdkModel({ alias: "haiku", resolvedModel: "claude-haiku-4-5-20251001" }),
      ],
      h.clock.now(),
    );
    const svc = createConnectionService(h.ctx);

    const tiers = await svc.getOrSkinTierModels();
    expect(tiers.opus).toBe("anthropic/claude-opus-4.8");
    // The daemon-owned sonnet roll-forward (5) is picked up — not a stale hardcoded 4.6.
    expect(tiers.sonnet).toBe("anthropic/claude-sonnet-5");
    expect(tiers.haiku).toBe("anthropic/claude-haiku-4.5");
  });

  test("both caches cold → the curated shortlist fallback (never throws)", async () => {
    const svc = createConnectionService(makeConnHarness(await freshDb()).ctx);
    // No seeding → both caches miss; the derivation degrades to the curated shortlist picks.
    const tiers = await svc.getOrSkinTierModels();
    expect(tiers.opus).toBe("anthropic/claude-opus-4.8");
    expect(tiers.sonnet).toBe("anthropic/claude-sonnet-5");
    expect(tiers.haiku).toBe("anthropic/claude-haiku-4.5");
  });
});
