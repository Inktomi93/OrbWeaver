// deriveOrSkinTierModels — the KILL for the hardcoded OR-skin tier map that used to live in the agent-sdk
// env firewall. DERIVE the mode-2 `{opus, sonnet, haiku}` OR slugs from the two live catalogs (the daemon
// `alias → resolvedModel` map + the OR id list) + a fallback chain that NEVER throws. The headline: the
// daemon's `sonnet → claude-sonnet-5` roll-forward is picked up automatically (no stale `4.6` pin), and a
// cold catalog degrades to the curated shortlist so a mode-2 turn always gets a coherent trio.

import type { AgentSdkModel } from "@orb/contracts/connection";
import { describe } from "vitest";
import { deriveOrSkinTierModels, toOpenRouterSlug } from "../../../../../packages/server/src/domain/connection/catalog/derive-or-skin-tier-models.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A daemon row for a tier alias → its current resolved wire id. */
function row(alias: string, resolvedModel: string | null): AgentSdkModel {
  return {
    alias,
    resolvedModel,
    displayName: alias,
    description: alias,
    supportsEffort: false,
    effortLevels: [],
    supportsAdaptiveThinking: false,
  };
}

// The live OR anthropic ids (2026-07-10) — the base variants only (the `-fast` throughput variants are
// present in the real list but must NOT win a tier default).
const OR_IDS = [
  "anthropic/claude-opus-4.8",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-fable-5",
  "openai/gpt-5",
];

const DAEMON = [row("opus", "claude-opus-4-8"), row("sonnet", "claude-sonnet-5"), row("haiku", "claude-haiku-4-5-20251001")];

describe("toOpenRouterSlug — the id→slug transform", () => {
  test("strips an 8-digit date suffix", () => {
    expect(toOpenRouterSlug("claude-haiku-4-5-20251001")).toBe("anthropic/claude-haiku-4.5");
  });

  test("joins a two-segment numeric tail with a dot", () => {
    expect(toOpenRouterSlug("claude-opus-4-8")).toBe("anthropic/claude-opus-4.8");
  });

  test("a single trailing number passes through unchanged", () => {
    expect(toOpenRouterSlug("claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
  });

  test("an already-prefixed id is idempotent (prefix stripped then re-added)", () => {
    expect(toOpenRouterSlug("anthropic/claude-opus-4-8")).toBe("anthropic/claude-opus-4.8");
  });
});

describe("deriveOrSkinTierModels — daemon + OR agree", () => {
  test("each tier resolves to the daemon's current version, transformed + present in the OR list", () => {
    const tiers = deriveOrSkinTierModels(DAEMON, OR_IDS);
    expect(tiers.opus).toBe("anthropic/claude-opus-4.8");
    // The daemon rolled sonnet forward to 5 — the derived slug is `claude-sonnet-5`, NOT the stale `4.6`.
    expect(tiers.sonnet).toBe("anthropic/claude-sonnet-5");
    expect(tiers.haiku).toBe("anthropic/claude-haiku-4.5");
  });
});

describe("deriveOrSkinTierModels — daemon id NOT in the OR list → newest same-family fallback", () => {
  test("falls to the newest same-family OR id when the daemon's resolved slug is absent", () => {
    // The daemon says sonnet-9, but the OR list only carries sonnet-5 / sonnet-4.6 → newest = sonnet-5.
    const daemon = [row("opus", "claude-opus-4-8"), row("sonnet", "claude-sonnet-9"), row("haiku", "claude-haiku-4-5")];
    const tiers = deriveOrSkinTierModels(daemon, OR_IDS);
    expect(tiers.sonnet).toBe("anthropic/claude-sonnet-5");
  });

  test("numeric-aware compare beats lexicographic (4.10 > 4.9)", () => {
    const orIds = ["anthropic/claude-opus-4.9", "anthropic/claude-opus-4.10", "anthropic/claude-opus-4.8"];
    // Daemon names a version absent from OR → newest same-family. 4.10 must beat 4.9 (segment-wise int
    // compare) — a lexicographic sort would wrongly pick 4.9.
    const daemon = [row("opus", "claude-opus-4-99")];
    const tiers = deriveOrSkinTierModels(daemon, orIds);
    expect(tiers.opus).toBe("anthropic/claude-opus-4.10");
  });

  test("the `-fast` variants are EXCLUDED from the newest-family pick", () => {
    const orIds = ["anthropic/claude-opus-4.8", "anthropic/claude-opus-4.9-fast"];
    // The daemon names an absent version; `-fast` is newer but must be skipped → 4.8 wins.
    const daemon = [row("opus", "claude-opus-5-0")];
    const tiers = deriveOrSkinTierModels(daemon, orIds);
    expect(tiers.opus).toBe("anthropic/claude-opus-4.8");
  });
});

describe("deriveOrSkinTierModels — cold catalogs (the never-throws fallback)", () => {
  test("both catalogs empty → the curated shortlist pick (transformed)", () => {
    const tiers = deriveOrSkinTierModels([], []);
    // The curated shortlist's family picks: opus-4-8, sonnet-5, haiku-4-5-20251001 → their OR slugs.
    expect(tiers.opus).toBe("anthropic/claude-opus-4.8");
    expect(tiers.sonnet).toBe("anthropic/claude-sonnet-5");
    expect(tiers.haiku).toBe("anthropic/claude-haiku-4.5");
  });

  test("a warm OR list but a cold daemon still prefers a LIVE OR id over the curated pin", () => {
    // No daemon rows, but the OR list carries the family → the newest OR id, not the curated fallback.
    const tiers = deriveOrSkinTierModels([], OR_IDS);
    expect(tiers.opus).toBe("anthropic/claude-opus-4.8");
    expect(tiers.sonnet).toBe("anthropic/claude-sonnet-5");
  });

  test("a daemon row with a null resolvedModel degrades to the OR/ curated fallback (never throws)", () => {
    const daemon = [row("opus", null), row("sonnet", null), row("haiku", null)];
    const tiers = deriveOrSkinTierModels(daemon, OR_IDS);
    expect(tiers.opus).toBe("anthropic/claude-opus-4.8");
    expect(tiers.sonnet).toBe("anthropic/claude-sonnet-5");
  });
});
