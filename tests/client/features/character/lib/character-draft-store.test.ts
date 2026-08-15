// character-draft-store — the character-card editor's crash-survival mirror wiring (#73, CRITICAL
// tier). Proves the WIRING the surface leans on through the same `mirrorDraft`/`readDraftSeed`
// vocabulary `create-autosave-entity-form.tsx`'s driver calls on every value change + clear-on-submit:
// mirror-on-change round-trips through the REAL per-editor store (not a generic fixture store), and
// clear-on-commit (the store's `clearDraft`, exactly what the factory's onSubmit success path calls)
// drops the mirror. DOM-free (no localStorage in node — the store degrades to an in-memory-only mirror
// per zustand's own `window.localStorage`-unavailable fallback; `create-entity-draft-store.test.ts`
// establishes the same posture with an injected storage instead).

import { mirrorDraft, readDraftSeed } from "@orb/client/forms";
import { DEFAULT_CHARACTER_CARD_FORM } from "../../../../../packages/client/src/features/character/lib/character-card-form-model.ts";
import { characterDraftStore } from "../../../../../packages/client/src/features/character/lib/character-draft-store.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("character draft mirrors a form-value change and reads it back keyed by entityId", () => {
  expect(readDraftSeed(characterDraftStore, "char_1")).toBeUndefined();

  const edited = { ...DEFAULT_CHARACTER_CARD_FORM, name: "Kira", description: "a rogue" };
  mirrorDraft(characterDraftStore, "char_1", edited);
  expect(readDraftSeed(characterDraftStore, "char_1")).toEqual(edited);

  // A second character is an independent slot.
  expect(readDraftSeed(characterDraftStore, "char_2")).toBeUndefined();
});

test("clearDraft — the factory's onSubmit-success call — drops the mirror", () => {
  const edited = { ...DEFAULT_CHARACTER_CARD_FORM, name: "Torvin" };
  mirrorDraft(characterDraftStore, "char_3", edited);
  expect(readDraftSeed(characterDraftStore, "char_3")).toEqual(edited);

  characterDraftStore.clearDraft("char_3");
  expect(readDraftSeed(characterDraftStore, "char_3")).toBeUndefined();
});

test("a stale-baseline draft is discarded on read — server outranks (readDraft's baseline gate)", () => {
  const edited = { ...DEFAULT_CHARACTER_CARD_FORM, name: "Old edit" };
  mirrorDraft(characterDraftStore, "char_4", edited, "baseline-a");
  expect(readDraftSeed(characterDraftStore, "char_4", "baseline-a")).toEqual(edited);
  // The server row moved since the edit began — a mismatched baseline discards the dead slot.
  expect(readDraftSeed(characterDraftStore, "char_4", "baseline-b")).toBeUndefined();
  expect(characterDraftStore.hasDraft("char_4")).toBe(false);
});
