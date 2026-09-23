// The device-local Recent-models MRU store (Settings → Connections → the model picker's Recent group). Exercised through the non-hook `__readRecentModelsForTest` snapshot (the reactive `useRecentModels` needs a
// React render — the `message-selection-store.test.ts` posture). Guards the load-bearing MRU semantics the
// picker's Recent group renders FROM: unshift (most-recent-first) · de-dupe on re-pick · cap · per-source
// isolation. Persistence itself is the createPersistedStore door (its own slice test); this pins the logic.

import { __readRecentModelsForTest, __resetAllRecentModels, pushRecentModel, RECENT_MODELS_CAP } from "@orb/client/state";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("recent-models MRU store", () => {
  beforeEach(() => {
    __resetAllRecentModels(); // reset the module singleton between tests.
  });

  test("a source with no picks reads empty", () => {
    expect(__readRecentModelsForTest("vllm")).toEqual([]);
  });

  test("push unshifts and de-dupes on re-pick (most-recent-first, no dup)", () => {
    pushRecentModel("openrouter", "a");
    pushRecentModel("openrouter", "b");
    pushRecentModel("openrouter", "a"); // re-pick a → moves to front, no dup
    expect(__readRecentModelsForTest("openrouter")).toEqual(["a", "b"]);
  });

  test("caps the MRU at RECENT_MODELS_CAP", () => {
    for (let i = 0; i < RECENT_MODELS_CAP + 3; i++) {
      pushRecentModel("openrouter", `m${i}`);
    }
    expect(__readRecentModelsForTest("openrouter")).toHaveLength(RECENT_MODELS_CAP);
  });

  test("each source keeps its own MRU (no cross-source bleed)", () => {
    pushRecentModel("openrouter", "or-1");
    pushRecentModel("custom_openai", "cu-1");
    expect(__readRecentModelsForTest("openrouter")).toEqual(["or-1"]);
    expect(__readRecentModelsForTest("custom_openai")).toEqual(["cu-1"]);
  });
});
