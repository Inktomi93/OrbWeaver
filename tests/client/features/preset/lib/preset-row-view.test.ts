// Unit: `presetRowSubtitle` (features/preset/lib/preset-row-view) — the F5 fix. Nine rows all titled
// "Default (edited)" carried NO subtitle, so the library was unpickable; the subtitle is the kind + the edit
// stamp (+ the fork lineage when the source name is known). `formatRelative` is injected, so this is
// deterministic.

import { presetRowSubtitle } from "../../../../../packages/client/src/features/preset/lib/preset-row-view";
import { expect, test } from "../../../../support/fixtures";

const formatRelative = (epochMs: number): string => `T-${epochMs}`;

// Crunch-list item 6: the ordinary `generation` kind used to be suppressed, which is how the built surface
// ended up printing a bare "edited 2h ago" against a mock that reads "generation · edited 3d ago".
test("the kind leads EVERY subtitle, including the ordinary generation", () => {
  expect(presetRowSubtitle("generation", 42, formatRelative, null)).toBe("generation · edited T-42");
});

test("a kind that carries extra scent leads it the same way", () => {
  expect(presetRowSubtitle("rpg-gm", 7, formatRelative, null)).toBe("rpg-gm · edited T-7");
  expect(presetRowSubtitle("roleplay", 7, formatRelative, null)).toBe("roleplay · edited T-7");
});

test("a known fork source prints the lineage between the kind and the stamp", () => {
  expect(presetRowSubtitle("generation", 7, formatRelative, "Default")).toBe("generation · forked from Default · edited T-7");
  expect(presetRowSubtitle("rpg-gm", 7, formatRelative, "RPG Game Master")).toBe("rpg-gm · forked from RPG Game Master · edited T-7");
});
