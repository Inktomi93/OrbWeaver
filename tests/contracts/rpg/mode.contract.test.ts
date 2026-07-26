// @orb/contracts/rpg/mode — the MODE_POLICY exhaustive record (§2.2). Pins: both rows exist as data from
// day one, lite's engine axes are all false while its DATA-plane axes (quests/journal) are TRUE (the
// 2026-07-26 amendment), full is all-true, and the prompt-strategy + tool tuples are per-mode.

import { MODE_POLICY, RPG_LITE_TOOL_NAMES } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("MODE_POLICY carries both mode rows as data from day one", () => {
  expect(Object.keys(MODE_POLICY).sort()).toEqual(["full", "lite"]);
});

test("lite gates every ENGINE axis false but the DATA planes (quests/journal) TRUE (the amendment)", () => {
  const lite = MODE_POLICY.lite;
  const engineAxes = ["seat", "sessions", "scenes", "clocks", "encounters", "maps", "morale", "perception", "checks", "npcs", "loot", "timeWeather"] as const;
  for (const axis of engineAxes) {
    expect(lite[axis]).toBe(false);
  }
  expect(lite.quests).toBe(true);
  expect(lite.journal).toBe(true);
});

test("lite is injection-strategy + soft tool-capable + the 7-tool tuple", () => {
  expect(MODE_POLICY.lite.prompt).toBe("injection");
  expect(MODE_POLICY.lite.requireToolCapable).toBe("soft");
  expect(MODE_POLICY.lite.tools).toEqual(RPG_LITE_TOOL_NAMES);
});

test("full is all-true, gm-preset strategy, hard tool-capable (present as data even though unmintable)", () => {
  const full = MODE_POLICY.full;
  expect(full.prompt).toBe("gm-preset");
  expect(full.requireToolCapable).toBe("hard");
  expect(full.seat).toBe(true);
  expect(full.checks).toBe(true);
  expect(full.timeWeather).toBe(true);
});
