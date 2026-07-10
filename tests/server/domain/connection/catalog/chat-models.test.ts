// getChatModel's 3-stage prefix-match + isChatModelId — the load-bearing
// curated lookup. The OR version-only → dated-id prefix match (stage 3) with its boundary check is the
// headline assertion: simplifying it silently mis-profiles Haiku.

import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { describe } from "vitest";
import {
  CHAT_MODELS,
  chatModelForTier,
  detectChatModelTier,
  getChatModel,
  isChatModelId,
} from "../../../../../packages/server/src/domain/connection/catalog/chat-models.ts";
import { expect, test } from "../../../../support/fixtures";

describe("getChatModel — 3-stage lookup", () => {
  test("stage 1: exact curated id", () => {
    expect(getChatModel("claude-opus-4-8")?.tier).toBe("opus");
    expect(getChatModel(DEFAULT_CHAT_MODEL_ID)?.tier).toBe("opus");
  });

  test("stage 2: OR slash-stripped + dotted id normalizes to the dashed curated id", () => {
    // The daemon resolves `sonnet` → `claude-sonnet-5` (the curated id); an OR dotted form of a curated
    // Claude id slash-strips + dashes to match. (The stale `claude-sonnet-4-6` is no longer curated — the
    // family→version fix routes a stale/aliased id through the daemon map, not this static shortlist.)
    expect(getChatModel("anthropic/claude-opus-4.8")?.tier).toBe("opus");
  });

  test("stage 3: OR version-only id prefix-matches the dated curated id", () => {
    const haiku = getChatModel("claude-haiku-4-5");
    expect(haiku?.tier).toBe("haiku");
    expect(haiku?.id).toBe("claude-haiku-4-5-20251001");
  });

  test("stage 3 boundary check: a MID-TOKEN prefix does NOT match (next char must be `-`)", () => {
    // `claude-haiku-4-5-2025` is a char-prefix of `claude-haiku-4-5-20251001` but lands mid-token (the
    // next char is `1`, not `-`), so the dash-bounded prefix guard rejects it. (A dash-bounded version
    // like `claude-haiku-4-5` DOES match — covered above.)
    expect(getChatModel("claude-haiku-4-5-2025")).toBeUndefined();
  });

  test("a non-curated id returns undefined (caller synthesizes instead)", () => {
    expect(getChatModel("openai/gpt-5")).toBeUndefined();
    expect(getChatModel("meta-llama/llama-3")).toBeUndefined();
  });
});

describe("the shortlist id brand guard", () => {
  test("true for a curated id, false for an OR id", () => {
    expect(isChatModelId("claude-opus-4-8")).toBe(true);
    expect(isChatModelId("claude-sonnet-5")).toBe(true);
    expect(isChatModelId("openai/gpt-5")).toBe(false);
    expect(isChatModelId("anthropic/claude-sonnet-5")).toBe(false);
  });

  test("every CHAT_MODELS entry is recognized by its own id", () => {
    for (const entry of CHAT_MODELS) {
      expect(isChatModelId(entry.id)).toBe(true);
    }
  });
});

describe("detectChatModelTier — the tier-preservation heal's lookup", () => {
  test("bare family aliases (case-insensitive)", () => {
    expect(detectChatModelTier("opus")).toBe("opus");
    expect(detectChatModelTier("Sonnet")).toBe("sonnet");
    expect(detectChatModelTier("HAIKU")).toBe("haiku");
  });

  test("a bare Claude id containing the tier token", () => {
    expect(detectChatModelTier("claude-sonnet-4-6")).toBe("sonnet");
    expect(detectChatModelTier("claude-haiku-4-0")).toBe("haiku");
  });

  test("an anthropic-prefixed Claude id", () => {
    expect(detectChatModelTier("anthropic/claude-opus-4.8")).toBe("opus");
  });

  test("a non-Claude id returns undefined", () => {
    expect(detectChatModelTier("gpt-4o")).toBeUndefined();
  });

  test("a fork whose id merely contains 'claude' does NOT false-match (anchor discipline)", () => {
    expect(detectChatModelTier("some-org/claude-fork-sonnet")).toBeUndefined();
  });
});

describe("chatModelForTier — total lookup over the three curated tiers", () => {
  test("returns the one shortlist entry per tier", () => {
    expect(chatModelForTier("opus").tier).toBe("opus");
    expect(chatModelForTier("sonnet").id).toBe("claude-sonnet-5");
    expect(chatModelForTier("haiku").tier).toBe("haiku");
  });

  test("CHAT_MODELS has exactly one entry per tier (the invariant chatModelForTier relies on)", () => {
    const tiers = CHAT_MODELS.map((entry) => entry.tier);
    expect(new Set(tiers).size).toBe(tiers.length);
  });
});
