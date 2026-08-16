// Unit: `presetRowSubtitle` (features/preset/lib/preset-row-view) — the F5 fix. Nine rows all titled
// "Default (edited)" carried NO subtitle, so the library was unpickable; the subtitle is the kind + the edit
// stamp (+ the fork lineage when the source name is known). `formatRelative` is injected, so this is
// deterministic.

import { presetRowSubtitle } from "../../../../../packages/client/src/features/preset/lib/preset-row-view.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const formatRelative = (epochMs: number): string => `T-${epochMs}`;

// Crunch-list item 6: the ordinary `generation` kind used to be suppressed, which is how the built surface
// ended up printing a bare "edited 2h ago" against a mock that reads "generation · edited 3d ago".
test("the kind leads EVERY subtitle, including the ordinary generation", () => {
  expect(presetRowSubtitle({ kind: "generation", updatedAt: 42, forkedFromName: null }, formatRelative)).toBe("generation · edited T-42");
});

test("a kind that carries extra scent leads it the same way", () => {
  expect(presetRowSubtitle({ kind: "rpg-gm", updatedAt: 7, forkedFromName: null }, formatRelative)).toBe("rpg-gm · edited T-7");
  expect(presetRowSubtitle({ kind: "roleplay", updatedAt: 7, forkedFromName: null }, formatRelative)).toBe("roleplay · edited T-7");
});

test("a known fork source prints the lineage between the kind and the stamp", () => {
  expect(presetRowSubtitle({ kind: "generation", updatedAt: 7, forkedFromName: "Default" }, formatRelative)).toBe(
    "generation · forked from Default · edited T-7",
  );
  expect(presetRowSubtitle({ kind: "rpg-gm", updatedAt: 7, forkedFromName: "RPG Game Master" }, formatRelative)).toBe(
    "rpg-gm · forked from RPG Game Master · edited T-7",
  );
});

// #99 item 3 — the ACTIVE row says so in WORDS. The state used to live only in the trailing cluster's
// filled dot while the context panel said "Active" in a chip, which is one fact in two vocabularies with
// the row's half unreadable. It leads the subtitle (a truncating text column) rather than returning to the
// title-line Badge that O-1 killed as a measured P0 — see preset-row-view.ts's doc comment.
test("the ACTIVE row leads its subtitle with the word, and an inactive row is byte-identical to before", () => {
  expect(presetRowSubtitle({ kind: "generation", updatedAt: 7, forkedFromName: null, active: true }, formatRelative)).toBe("Active · generation · edited T-7");
  expect(presetRowSubtitle({ kind: "generation", updatedAt: 7, forkedFromName: "Default", active: true }, formatRelative)).toBe(
    "Active · generation · forked from Default · edited T-7",
  );
  expect(presetRowSubtitle({ kind: "generation", updatedAt: 7, forkedFromName: null, active: false }, formatRelative)).toBe(
    presetRowSubtitle({ kind: "generation", updatedAt: 7, forkedFromName: null }, formatRelative),
  );
});
