// The character action registry's contract (#838) — the vocabulary the list row's kebab, the CONTEXT
// pane's `Character actions` and the bulk bar all render from.
//
// The claim these pins hold: one artifact has ONE action vocabulary, and each surface shows a SLICE of it.
// Before the registry the three menus were hand-spelled and shared exactly `Delete`, which is how
// `Export card` ended up reachable only from the list the user had already left. The per-scope expectations
// below are LITERAL — an expectation derived from the registry would agree with the registry no matter what
// the registry said, which is the shape of a test that cannot fail.

import { describe } from "vitest";
// Deep import the PURE lib module (NOT the "@orb/client/features/character" barrel): a barrel import drags
// browser TSX into the dom-less root typecheck:graph program (the character-list-view.test.ts precedent).
import {
  CHARACTER_ACTION_SCOPE_IDS,
  CHARACTER_ACTION_SCOPES,
  CHARACTER_ACTIONS,
  characterActionItemsForScope,
  characterActionLabel,
  characterActionsForScope,
} from "../../../../../packages/client/src/features/character/lib/character-actions.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The vocabulary, spelled out — the exact accessible names each surface is allowed to render. */
const EXPECTED_LABELS_BY_SCOPE = {
  row: ["Archive", "Duplicate", "Export card", "Delete"],
  open: ["Open in Refinery", "Archive", "Duplicate", "Export card", "Convert to persona", "Set as welcome greeter", "Delete"],
  bulk: ["Tag", "Archive", "Delete"],
} as const;

describe("the character action vocabulary", () => {
  test("every scope renders exactly its declared slice, in order", () => {
    for (const scope of CHARACTER_ACTION_SCOPES) {
      expect(characterActionsForScope(scope).map((action) => action.label)).toEqual([...EXPECTED_LABELS_BY_SCOPE[scope]]);
    }
  });

  test("the scope map is total over the scope axis — a new scope cannot be decided by omission", () => {
    expect(Object.keys(CHARACTER_ACTION_SCOPE_IDS).sort()).toEqual([...CHARACTER_ACTION_SCOPES].sort());
  });

  test("every verb ANY scope offers has a full definition, and every definition is reachable from a scope", () => {
    const scoped = new Set(CHARACTER_ACTION_SCOPES.flatMap((scope) => [...CHARACTER_ACTION_SCOPE_IDS[scope]]));
    // Both directions: a scoped verb with no entry would throw on render; an entry no scope offers is a
    // dead affordance, which is the defect class this registry exists to make un-spellable.
    expect([...scoped].sort()).toEqual(Object.keys(CHARACTER_ACTIONS).sort());
    for (const id of scoped) {
      expect(CHARACTER_ACTIONS[id].id).toBe(id);
      expect(CHARACTER_ACTIONS[id].label.length).toBeGreaterThan(0);
    }
  });

  test("ONE spelling per verb — a verb offered on two surfaces carries the same name on both", () => {
    // Archive is on all three; Duplicate and Export card on two. The pre-registry defect was three menus
    // free to name the same verb differently (or to omit it).
    expect(CHARACTER_ACTIONS.archive.label).toBe("Archive");
    expect(CHARACTER_ACTIONS.exportCard.label).toBe("Export card");
    const labels = Object.values(CHARACTER_ACTIONS).map((action) => action.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("the destructive verb is last in every scope, and it is the only one", () => {
    for (const scope of CHARACTER_ACTION_SCOPES) {
      const actions = characterActionsForScope(scope);
      expect(actions.filter((action) => action.destructive).map((action) => action.id)).toEqual(["delete"]);
      expect(actions.at(-1)?.id).toBe("delete");
      // The menu hosts render the destructive verb through their own slot + confirm, never as a plain item.
      expect(characterActionItemsForScope(scope).some((action) => action.destructive)).toBe(false);
    }
  });

  test("Export card is offered wherever a character can be acted on individually — including the OPEN one", () => {
    // The P1 itself: with a character open there was no path to export her card, so the reviewer concluded
    // export did not exist. Bulk has no export arm (the route is single-entity), which is why it is absent
    // there and NOT a gap.
    expect(CHARACTER_ACTION_SCOPE_IDS.open).toContain("exportCard");
    expect(CHARACTER_ACTION_SCOPE_IDS.row).toContain("exportCard");
    expect(CHARACTER_ACTION_SCOPE_IDS.bulk).not.toContain("exportCard");
  });

  test("Export card fans out into the two containers the ONE route serves", () => {
    expect(CHARACTER_ACTIONS.exportCard.formats.map((format) => [format.label, format.query])).toEqual([
      ["With avatar (.png)", ""],
      ["Data only (.json)", "?format=json"],
    ]);
    // Only export fans out — every other verb is a single item.
    for (const action of Object.values(CHARACTER_ACTIONS)) {
      expect(action.formats.length === 0 || action.id === "exportCard").toBe(true);
    }
  });

  test("Tag stays bulk-only — the open character's one tagging home is the chip strip's `Add tag`", () => {
    // Deviation from the review's fix text, ruled 2026-08-30: promoting Tag into the kebab would mint the
    // second home for one verb that this registry exists to kill (`character-tags-row.tsx` is the first).
    expect(CHARACTER_ACTION_SCOPE_IDS.bulk).toContain("tag");
    expect(CHARACTER_ACTION_SCOPE_IDS.open).not.toContain("tag");
    expect(CHARACTER_ACTION_SCOPE_IDS.row).not.toContain("tag");
  });

  test("archive is the one state TOGGLE, and it wears its second face only when the character is archived", () => {
    expect(characterActionLabel(CHARACTER_ACTIONS.archive, { archived: false })).toBe("Archive");
    expect(characterActionLabel(CHARACTER_ACTIONS.archive, { archived: true })).toBe("Unarchive");
    for (const action of Object.values(CHARACTER_ACTIONS)) {
      if (action.id === "archive") {
        continue;
      }
      expect(action.toggledLabel).toBeNull();
      expect(characterActionLabel(action, { archived: true })).toBe(action.label);
    }
  });
});
