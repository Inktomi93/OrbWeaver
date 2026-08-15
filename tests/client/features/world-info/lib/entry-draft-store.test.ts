// entry-draft-store — the lorebook entry editor's crash-survival mirror wiring (#73, HIGH tier). Same
// posture as `character-draft-store.test.ts`: proves mirror-on-change + clear-on-commit through the
// REAL per-editor store, driven by the same `mirrorDraft`/`readDraftSeed` vocabulary the autosave
// factory's driver calls. DOM-free (no localStorage in node — the store degrades to an in-memory-only
// mirror).

import { mirrorDraft, readDraftSeed } from "@orb/client/forms";
import { entryDraftStore } from "../../../../../packages/client/src/features/world-info/lib/entry-draft-store.ts";
import { NEW_ENTRY_FORM } from "../../../../../packages/client/src/features/world-info/lib/entry-editor-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("entry draft mirrors a form-value change and reads it back keyed by entityId", () => {
  expect(readDraftSeed(entryDraftStore, "entry_1")).toBeUndefined();

  const edited = { ...NEW_ENTRY_FORM, title: "Ashfall Keep", content: "A ruined fortress in the north." };
  mirrorDraft(entryDraftStore, "entry_1", edited);
  expect(readDraftSeed(entryDraftStore, "entry_1")).toEqual(edited);

  expect(readDraftSeed(entryDraftStore, "entry_2")).toBeUndefined();
});

test("clearDraft — the factory's onSubmit-success call — drops the mirror", () => {
  const edited = { ...NEW_ENTRY_FORM, title: "Draft entry" };
  mirrorDraft(entryDraftStore, "entry_3", edited);
  expect(readDraftSeed(entryDraftStore, "entry_3")).toEqual(edited);

  entryDraftStore.clearDraft("entry_3");
  expect(readDraftSeed(entryDraftStore, "entry_3")).toBeUndefined();
});

test("a stale-baseline draft is discarded on read — server outranks (readDraft's baseline gate)", () => {
  const edited = { ...NEW_ENTRY_FORM, title: "Old edit" };
  mirrorDraft(entryDraftStore, "entry_4", edited, "baseline-a");
  expect(readDraftSeed(entryDraftStore, "entry_4", "baseline-a")).toEqual(edited);
  expect(readDraftSeed(entryDraftStore, "entry_4", "baseline-b")).toBeUndefined();
  expect(entryDraftStore.hasDraft("entry_4")).toBe(false);
});
