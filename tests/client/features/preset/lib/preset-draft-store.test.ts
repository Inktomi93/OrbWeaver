// preset-draft-store — the preset editor's crash-survival mirror wiring (#73, HIGH tier). Same posture
// as `character-draft-store.test.ts`: proves mirror-on-change + clear-on-commit through the REAL
// per-editor store, driven by the same `mirrorDraft`/`readDraftSeed` vocabulary the autosave factory's
// driver calls. DOM-free (no localStorage in node — the store degrades to an in-memory-only mirror).

import { mirrorDraft, readDraftSeed } from "@orb/client/forms";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { presetDraftStore } from "../../../../../packages/client/src/features/preset/lib/preset-draft-store.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("preset draft mirrors a form-value change and reads it back keyed by entityId", () => {
  expect(readDraftSeed(presetDraftStore, "preset_1")).toBeUndefined();

  const edited = { ...DEFAULT_PROMPT_CONFIG };
  mirrorDraft(presetDraftStore, "preset_1", edited);
  expect(readDraftSeed(presetDraftStore, "preset_1")).toEqual(edited);

  expect(readDraftSeed(presetDraftStore, "preset_2")).toBeUndefined();
});

test("clearDraft — the factory's onSubmit-success call — drops the mirror", () => {
  const edited = { ...DEFAULT_PROMPT_CONFIG };
  mirrorDraft(presetDraftStore, "preset_3", edited);
  expect(readDraftSeed(presetDraftStore, "preset_3")).toEqual(edited);

  presetDraftStore.clearDraft("preset_3");
  expect(readDraftSeed(presetDraftStore, "preset_3")).toBeUndefined();
});

test("a stale-baseline draft is discarded on read — server outranks (readDraft's baseline gate)", () => {
  const edited = { ...DEFAULT_PROMPT_CONFIG };
  mirrorDraft(presetDraftStore, "preset_4", edited, "baseline-a");
  expect(readDraftSeed(presetDraftStore, "preset_4", "baseline-a")).toEqual(edited);
  expect(readDraftSeed(presetDraftStore, "preset_4", "baseline-b")).toBeUndefined();
  expect(presetDraftStore.hasDraft("preset_4")).toBe(false);
});
