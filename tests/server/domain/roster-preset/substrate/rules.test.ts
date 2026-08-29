// substrate/rules — the pure cast-rule projection (B10's rules rider): junction rows grouped per
// preset in the order persistence served them (presetId, position), each projected onto the wire view
// VERBATIM (a catalogue-orphaned id stays visible — degraded display + a reported skip at apply beat a
// silently shrinking cast).

import type { RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { groupCastRuleViews } from "../../../../../packages/server/src/domain/roster-preset/substrate/rules.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const P1 = castId<RosterPresetId>("roster_preset_r1");
const P2 = castId<RosterPresetId>("roster_preset_r2");

test("groups the FLAT sorted rows per preset, order-preserving, projecting id + bag verbatim", () => {
  const grouped = groupCastRuleViews([
    { presetId: P1, rulePresetId: "sceneVeil", position: 0, knobs: { veilWord: "((fade))", redirect: "cut" } },
    { presetId: P1, rulePresetId: "pacingNudge", position: 1, knobs: { everyN: 4, steer: "s" } },
    { presetId: P2, rulePresetId: "clockFires", position: 0, knobs: { n: 6, firedArm: "notify", firedText: "t" } },
  ]);
  expect(grouped.get(P1)?.map((rule) => rule.rulePresetId)).toEqual(["sceneVeil", "pacingNudge"]);
  expect(grouped.get(P1)?.[0]?.knobs).toEqual({ veilWord: "((fade))", redirect: "cut" });
  expect(grouped.get(P2)?.map((rule) => rule.rulePresetId)).toEqual(["clockFires"]);
  expect(grouped.get(castId<RosterPresetId>("roster_preset_absent"))).toBeUndefined();
});

test("an empty row set yields an empty map (the rules-free library page)", () => {
  expect(groupCastRuleViews([]).size).toBe(0);
});
