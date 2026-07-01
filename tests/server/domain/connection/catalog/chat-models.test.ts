// getChatModel's 3-stage prefix-match (connection.md Esoteric §6) + isChatModelId — the load-bearing
// curated lookup. The OR version-only → dated-id prefix match (stage 3) with its boundary check is the
// headline assertion: simplifying it silently mis-profiles Haiku.

import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { describe } from "vitest";
import {
  CHAT_MODELS,
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
    expect(getChatModel("anthropic/claude-sonnet-4.6")?.tier).toBe("sonnet");
  });

  test("stage 3: OR version-only id prefix-matches the dated curated id", () => {
    // `claude-haiku-4-5` (OR form) → `claude-haiku-4-5-20251001` (dated curated entry).
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
    expect(isChatModelId("claude-sonnet-4-6")).toBe(true);
    expect(isChatModelId("openai/gpt-5")).toBe(false);
    expect(isChatModelId("anthropic/claude-sonnet-4.6")).toBe(false);
  });

  test("every CHAT_MODELS entry is recognized by its own id", () => {
    for (const entry of CHAT_MODELS) {
      expect(isChatModelId(entry.id)).toBe(true);
    }
  });
});
