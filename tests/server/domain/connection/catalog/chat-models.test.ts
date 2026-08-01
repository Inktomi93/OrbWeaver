// getChatModel's 3-stage prefix-match + isChatModelId — the load-bearing
// curated lookup. The OR version-only → dated-id prefix match (stage 3) with its boundary check is the
// headline assertion: simplifying it silently mis-profiles Haiku.

import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { describe } from "vitest";
import {
  CHAT_MODELS,
  CLAUDE_CAPABILITY_FLOOR,
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
    // An OR dotted form of a curated Claude id slash-strips + dashes to match. `claude-sonnet-4-6` is
    // curated AGAIN since c656bc1b (deliberately — OR's catalog doesn't advertise structured for it, so
    // without the curated entry an rpg game on 4.6 wrongly resolves trackers-readonly).
    expect(getChatModel("anthropic/claude-opus-4.8")?.tier).toBe("opus");
    expect(getChatModel("anthropic/claude-sonnet-4.6")?.id).toBe("claude-sonnet-4-6");
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

describe("CLAUDE_CAPABILITY_FLOOR — the uncurated-Claude inheritance", () => {
  test("is DERIVED from the table: an axis is in the floor iff EVERY curated entry declares it", () => {
    expect(CLAUDE_CAPABILITY_FLOOR).toEqual({
      parallelTools: CHAT_MODELS.every((entry) => entry.capability.tools?.parallel === true),
      structuredOutput: CHAT_MODELS.every((entry) => entry.capability.output.structured === true),
      vision: CHAT_MODELS.every((entry) => entry.capability.input?.vision === true),
    });
  });

  test("today every curated Claude declares all three — so a NEWER Claude inherits all three", () => {
    expect(CLAUDE_CAPABILITY_FLOOR).toEqual({ parallelTools: true, structuredOutput: true, vision: true });
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

describe("chatModelForTier — flagship lookup over the three curated tiers", () => {
  test("returns the tier's FLAGSHIP (first-listed) entry", () => {
    expect(chatModelForTier("opus").tier).toBe("opus");
    // Sonnet has TWO curated entries since c656bc1b (4.6 curated for its structured flag); the tier
    // lookup must return the flagship, so LIST ORDER is load-bearing — sonnet-5 stays first.
    expect(chatModelForTier("sonnet").id).toBe("claude-sonnet-5");
    expect(chatModelForTier("haiku").tier).toBe("haiku");
  });

  test("every tier has at least one entry, and the FIRST per tier is the flagship (the ordering invariant chatModelForTier relies on)", () => {
    const tiers = new Set(CHAT_MODELS.map((entry) => entry.tier));
    expect([...tiers].sort()).toEqual(["haiku", "opus", "sonnet"]);
    // A curated non-flagship (claude-sonnet-4-6) is ALLOWED; it must simply never precede its flagship.
    const firstSonnet = CHAT_MODELS.find((entry) => entry.tier === "sonnet");
    expect(firstSonnet?.id).toBe("claude-sonnet-5");
  });
});
