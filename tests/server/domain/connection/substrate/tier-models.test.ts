// deriveOrSkin — the substrate mediator over catalog/deriveOrSkinTierModels. Pins the header's ONE claim
// this seam owns (the derivation itself is pinned in catalog/derive-or-skin-tier-models.test.ts): a `null`
// (cold cache) snapshot normalizes to an EMPTY input, not a crash or a passthrough of `null` — so a
// mode-2 turn always resolves through the derivation's own fallback chain to the curated pick.

import type { AgentSdkModel, ModelCatalogEntry } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { CHAT_MODELS } from "../../../../../packages/server/src/domain/connection/catalog/chat-models.ts";
import { deriveOrSkin } from "../../../../../packages/server/src/domain/connection/substrate/tier-models.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const opus = CHAT_MODELS.find((m) => m.tier === "opus");
if (opus === undefined) {
  throw new Error("test fixture: expected a curated opus entry");
}

describe("deriveOrSkin", () => {
  test("both null (cold cache) resolves every tier to its curated pick — never throws", () => {
    const result = deriveOrSkin(null, null);
    expect(result.opus).toContain("opus");
    expect(result.sonnet).toContain("sonnet");
    expect(result.haiku).toContain("haiku");
  });

  test("a warm cached snapshot is passed through unchanged (id-mapped) rather than treated as cold", () => {
    const cached: ModelCatalogEntry[] = [
      {
        id: "anthropic/claude-opus-4.8",
        name: "opus",
        contextLength: null,
        promptPrice: null,
        completionPrice: null,
        cacheReadPrice: null,
        cacheWritePrice: null,
        inputModalities: ["text"],
        supportedParameters: [],
      },
    ];
    const agentSdk: AgentSdkModel[] = [
      {
        alias: "opus",
        resolvedModel: castId<ModelId>(opus.id),
        displayName: "Opus",
        description: "",
        supportsEffort: true,
        effortLevels: ["high"],
        supportsAdaptiveThinking: true,
      },
    ];
    const result = deriveOrSkin(cached, agentSdk);
    expect(result.opus).toBe("anthropic/claude-opus-4.8");
  });
});
