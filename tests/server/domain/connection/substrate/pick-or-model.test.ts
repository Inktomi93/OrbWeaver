// pickOrModel — the OpenRouter dual guard (connection.md Esoteric §4/§5, invariant 7). Asserts both arms:
// (1) a Claude shortlist id is rejected on the OR path; (2) the catalog guard fires when WARM but is
// SKIPPED on a cold cache (the deliberate cold-skip, not a blanket reject).

import type { ModelCatalogEntry } from "@orb/contracts/connection";
import { DEFAULT_OR_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { describe } from "vitest";
import { pickOrModel } from "../../../../../packages/server/src/domain/connection/substrate/pick-or-model.ts";
import { expect, test } from "../../../../support/fixtures";

const entry = (id: string): ModelCatalogEntry => ({
  id,
  name: id,
  contextLength: null,
  promptPrice: null,
  completionPrice: null,
  cacheReadPrice: null,
  cacheWritePrice: null,
  inputModalities: ["text"],
  supportedParameters: [],
});

describe("pickOrModel — dual guard", () => {
  test("null model heals to the OR default", () => {
    expect(pickOrModel(null, null)).toBe(DEFAULT_OR_CHAT_MODEL_ID);
  });

  test("guard (1): a Claude shortlist id is rejected to the OR default", () => {
    expect(pickOrModel("claude-opus-4-8", [entry("openai/gpt-5")])).toBe(DEFAULT_OR_CHAT_MODEL_ID);
  });

  test("guard (2) cold-skip: a cold cache trusts the caller (no blanket reject)", () => {
    expect(pickOrModel("openai/gpt-5", null)).toBe("openai/gpt-5");
  });

  test("guard (2) warm-present: an id in the warm catalog passes", () => {
    expect(pickOrModel("openai/gpt-5", [entry("openai/gpt-5")])).toBe("openai/gpt-5");
  });

  test("guard (2) warm-absent: an id missing from the warm catalog heals to default", () => {
    expect(pickOrModel("ghost/model", [entry("openai/gpt-5")])).toBe(DEFAULT_OR_CHAT_MODEL_ID);
  });
});
