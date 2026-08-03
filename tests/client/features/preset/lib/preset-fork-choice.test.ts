// Unit: the pure half of the built-in's fork CHOICE (features/preset/lib/preset-fork-choice). The two things
// the dialog must not get wrong: the fork it NAMES on the "keep editing" arm has to be the row the server's
// `converge` intent would actually write to (oldest by createdAt, id as the tiebreak — the mirror of
// `persistence/queries.ts#findOwnedForkOf`, which the CT can't prove because it stubs the server), and the
// suggested name for a new fork must not be one the owner already uses.

import { findConvergenceFork, suggestForkName } from "../../../../../packages/client/src/features/preset/lib/preset-fork-choice.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const BUILT_IN = "preset_00000000000000000000000000";

function row(
  id: string,
  name: string,
  forkedFrom: string | null,
  createdAt: number,
): { id: string; name: string; forkedFrom: string | null; createdAt: number } {
  return { id, name, forkedFrom, createdAt };
}

test("no fork of the source — the silent copy-on-write case", () => {
  const rows = [row(BUILT_IN, "Default", null, 0), row("preset_a", "Authored", null, 5), row("preset_b", "Clone", "preset_packaged", 6)];
  expect(findConvergenceFork(rows, BUILT_IN)).toBeNull();
});

test("the OLDEST fork wins, whatever order the list arrives in", () => {
  const rows = [row("preset_new", "Newer", BUILT_IN, 90), row("preset_old", "Older", BUILT_IN, 10), row("preset_mid", "Middle", BUILT_IN, 50)];
  expect(findConvergenceFork(rows, BUILT_IN)?.id).toBe("preset_old");
});

test("same createdAt (the residual race's leftovers) — the id tiebreak keeps the answer stable, like the server's", () => {
  const rows = [row("preset_race_b", "Race B", BUILT_IN, 10), row("preset_race_a", "Race A", BUILT_IN, 10)];
  expect(findConvergenceFork(rows, BUILT_IN)?.id).toBe("preset_race_a");
});

test("forks of ANOTHER source are never the convergence pick", () => {
  const rows = [row("preset_pkg", "GM copy", "preset_packaged_rpg", 1)];
  expect(findConvergenceFork(rows, BUILT_IN)).toBeNull();
});

test("the suggestion numbers the fork this WOULD be — one existing fork suggests 'Default fork 2'", () => {
  expect(suggestForkName("Default", 1, ["Default", "Default (edited)"])).toBe("Default fork 2");
  expect(suggestForkName("Default", 3, ["Default"])).toBe("Default fork 4");
});

test("the suggestion skips names the owner already uses — never one the server would silently renumber", () => {
  expect(suggestForkName("Default", 1, ["Default fork 2", "Default fork 3"])).toBe("Default fork 4");
});
