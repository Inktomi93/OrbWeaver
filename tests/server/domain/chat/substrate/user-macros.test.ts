// substrate/user-macros — the declaration-set policy shared by the per-turn registry build and the
// picks-pane read: the GAME's def shadows the PRESET's on a name clash (owner ruling, 2026-08-01). Pins the
// rule itself; the assembly suite pins what the shadow means for a built registry (which def renders, which
// never draws) and the lifecycle suite what it means for the pane.
import { describe } from "vitest";
import { shadowPresetUserMacros } from "../../../../../packages/server/src/domain/chat/substrate/user-macros";
import { expect, test } from "../../../../support/fixtures";

const preset = [{ name: "mood", body: "preset" }, { name: "stakes" }];

describe("shadowPresetUserMacros — game shadows preset", () => {
  test("no game defs ⇒ the preset set passes through untouched (identity, not a copy-per-turn)", () => {
    expect(shadowPresetUserMacros(preset, [])).toBe(preset);
  });

  test("a clashing name drops the PRESET def; non-clashing preset defs survive whole", () => {
    expect(shadowPresetUserMacros(preset, [{ name: "mood" }])).toEqual([{ name: "stakes" }]);
  });

  test("the match is case-INSENSITIVE (the registry's own lookup posture) — else the shadow becomes a refusal", () => {
    expect(shadowPresetUserMacros([{ name: "Mood" }], [{ name: "mOOd" }])).toEqual([]);
  });

  test("a game def that clashes with nothing removes nothing", () => {
    expect(shadowPresetUserMacros(preset, [{ name: "omen" }])).toEqual(preset);
  });
});
