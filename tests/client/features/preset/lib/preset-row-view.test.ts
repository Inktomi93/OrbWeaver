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

// #481 (side-eye 2026-08-22 P3-5) — THE SUBTITLE NEVER CARRIES THE ACTIVE MARKER. #99 item 3 briefly led it
// with "Active · " on the theory that the subtitle is a flexible truncating column; measured at the docked
// list it is 155px, and the prefix pushed the ACTIVE row's own timestamp into an ellipsis while every
// inactive row showed its metadata whole. The derivation is now the SAME STRING for every row, active or
// not — the state's readout is the row's radio (filled dot + `aria-checked`) plus the activation
// announcement, neither of which spends subtitle width. See preset-row-view.ts's doc comment.
test("the subtitle is identical whether or not the row is the active pick — no marker, no width spent", () => {
  const subtitle = presetRowSubtitle({ kind: "roleplay", updatedAt: 7, forkedFromName: null }, formatRelative);
  expect(subtitle).toBe("roleplay · edited T-7");
  // The old shape's literal must not survive anywhere in the derivation, on any input.
  expect(presetRowSubtitle({ kind: "generation", updatedAt: 7, forkedFromName: "Default" }, formatRelative)).not.toContain("Active");
});
