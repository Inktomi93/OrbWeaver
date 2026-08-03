// Unit: `uniquePresetName` (domain/preset/substrate/names) — the mint-time de-collision that stops the
// name-DERIVING mints (the COW fork's "<base> (edited)", the client's "Copy of X") from stacking N rows
// under one identical name (visual-blech audit F5: nine unreadable "Default (edited)" rows).

import { uniquePresetName } from "../../../../../packages/server/src/domain/preset/substrate/names.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("a free name is returned untouched (the FIRST mint is never numbered)", () => {
  expect(uniquePresetName("Default (edited)", ["Roleplay", "Default"])).toBe("Default (edited)");
  expect(uniquePresetName("Default (edited)", [])).toBe("Default (edited)");
});

test("the collision arm: a taken name gets the next free ordinal, starting at 2", () => {
  expect(uniquePresetName("Default (edited)", ["Default (edited)"])).toBe("Default (edited) 2");
  expect(uniquePresetName("Default (edited)", ["Default (edited)", "Default (edited) 2"])).toBe("Default (edited) 3");
});

test("the ordinal scan skips over gaps rather than reusing a live number", () => {
  // "… 2" was deleted; the next mint must NOT reuse it while "… 3" lives, or the library gets two ambiguous
  // rows again the moment the user re-creates the deleted one.
  expect(uniquePresetName("Copy of X", ["Copy of X", "Copy of X 3"])).toBe("Copy of X 2");
  expect(uniquePresetName("Copy of X", ["Copy of X", "Copy of X 2", "Copy of X 3", "Copy of X 4"])).toBe("Copy of X 5");
});

test("collision is EXACT-name only — a shared prefix is not a collision", () => {
  expect(uniquePresetName("Default", ["Default (edited)", "Default 2 backup"])).toBe("Default");
});
