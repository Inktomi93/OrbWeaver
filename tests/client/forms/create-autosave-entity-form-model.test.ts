// The autosave boundary's three module-scope pure helpers, headless. The CT sibling
// (`create-autosave-entity-form.ct.tsx`) drives them THROUGH the live boundary, which is where their
// integration is proven; what needs pinning here is the thing a CT can only sample — `foldSaveState`'s
// PRECEDENCE, every cell of it. The fold is the one derivation of "is this form saved", it is read by every
// autosave surface in the app, and its ORDER is the law (a `blocked` that outranked `error` would hide a
// failed write behind an invalid field; an `unsaved` that outranked `blocked` would say "Saving…" over a
// write the driver is refusing to make). A table is the honest shape for a law that is a table.

import { describe } from "vitest";
// The DEEP path, not `@orb/client/forms`: these three are the Session's internals and are deliberately off
// the barrel (a consumer that could reach `foldSaveState` could re-derive a status the boundary already
// hands it — the second truth `AutosaveSession` exists to prevent). Same import shape as the
// `save-circuit-breaker.test.ts` sibling, which tests the family's other unexported internal.
import { foldSaveState, hasUnsavedEdits, takeDiscard } from "../../../packages/client/src/forms/create-autosave-entity-form-model.ts";
import { expect, test } from "../../support/fixtures.ts";

describe("hasUnsavedEdits", () => {
  test("compares STRUCTURALLY, not by identity — a mapper-fresh object with equal content is clean", () => {
    expect(hasUnsavedEdits({ a: 1, list: ["x"] }, { a: 1, list: ["x"] })).toBe(false);
  });

  test("is true the moment any value diverges from the last-saved baseline", () => {
    expect(hasUnsavedEdits({ a: 1 }, { a: 2 })).toBe(true);
    expect(hasUnsavedEdits({ a: 1, list: ["x"] }, { a: 1, list: ["x", "y"] })).toBe(true);
  });
});

describe("takeDiscard", () => {
  test("reads AND clears — a staged discard is consumed by exactly one teardown", () => {
    const ref = { current: true };
    expect(takeDiscard(ref)).toBe(true);
    expect(ref.current).toBe(false);
    expect(takeDiscard(ref)).toBe(false);
  });
});

describe("foldSaveState", () => {
  // `error` FIRST: a save that genuinely failed is a stronger fact about the write than anything about
  // what is in the box now, and it owns the retry affordance.
  test("error outranks every other fact, including an invalid form and an unwritten edit", () => {
    expect(foldSaveState({ driver: "error", isValid: false, readOnlyDirty: true, unsaved: true, unwritable: false })).toBe("error");
    expect(foldSaveState({ driver: "error", isValid: true, readOnlyDirty: false, unsaved: false, unwritable: false })).toBe("error");
  });

  // `blocked` SECOND: the driver is HOLDING this write, so it is not "saving" and it is certainly not saved.
  test("an invalid form reads blocked, whatever the driver was doing", () => {
    expect(foldSaveState({ driver: "saved", isValid: false, readOnlyDirty: false, unsaved: false, unwritable: false })).toBe("blocked");
    expect(foldSaveState({ driver: "saving", isValid: false, readOnlyDirty: false, unsaved: true, unwritable: false })).toBe("blocked");
  });

  test("a declared read-only mount that got edited reads blocked — that write will never be attempted", () => {
    expect(foldSaveState({ driver: "saved", isValid: true, readOnlyDirty: true, unsaved: true, unwritable: false })).toBe("blocked");
  });

  // THE #81 P0 ARM. Everything below here was "saved" before the fold existed.
  test("an unwritten edit reads saving, never saved — the debounce window is not a success", () => {
    expect(foldSaveState({ driver: "saved", isValid: true, readOnlyDirty: false, unsaved: true, unwritable: false })).toBe("saving");
  });

  test("a clean, valid, writable form reads saved — the fold does not manufacture a pending write", () => {
    expect(foldSaveState({ driver: "saved", isValid: true, readOnlyDirty: false, unsaved: false, unwritable: false })).toBe("saved");
  });

  test("passes the driver through once it is genuinely writing, edit or no edit", () => {
    expect(foldSaveState({ driver: "saving", isValid: true, readOnlyDirty: false, unsaved: true, unwritable: false })).toBe("saving");
    expect(foldSaveState({ driver: "saving", isValid: true, readOnlyDirty: false, unsaved: false, unwritable: false })).toBe("saving");
  });

  // #1716's arm, ABOVE `error`: the stored row cannot be read, so no write from this form can ever land —
  // and `error` (whose whole affordance is a Retry) would be the wrong verb over a refusal no retry clears.
  test("unwritable outranks everything, including a genuinely failed save", () => {
    expect(foldSaveState({ driver: "error", isValid: true, readOnlyDirty: false, unsaved: true, unwritable: true })).toBe("unreadable");
    expect(foldSaveState({ driver: "saved", isValid: false, readOnlyDirty: true, unsaved: true, unwritable: true })).toBe("unreadable");
    expect(foldSaveState({ driver: "saved", isValid: true, readOnlyDirty: false, unsaved: false, unwritable: true })).toBe("unreadable");
  });

  // A read-only mount that is CLEAN is not blocked — it is simply in sync, which is the overwhelmingly
  // common member-view case and must not wear a warning.
  test("a clean read-only mount reads saved", () => {
    expect(foldSaveState({ driver: "saved", isValid: true, readOnlyDirty: false, unsaved: false, unwritable: false })).toBe("saved");
  });
});
