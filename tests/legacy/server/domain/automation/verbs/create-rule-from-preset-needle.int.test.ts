// S3 — the needle (§4 #16): the score → meter + backdrop pair, and what does NOT cross into the member-visible plane.
// @subject packages/server/src/domain/automation/verbs/create-rule-from-preset.ts

import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import { rpgGames, worldEntries } from "@orb/db";
import type { AutomationRuleId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { principal } from "../_support.ts";
import { armBackdrop, mintAndEnable, nth, outcomes, selectRuleState, setup, turnCompleted } from "./_create-rule-from-preset-support.ts";

// ── §4 #16 the needle (RULED 2026-08-24 — ships, OFF by default) ──────────────────────────────────────
// The ONE preset that publishes a model-authored value into the MEMBER-VISIBLE chat-vars plane, which is why
// its receipts are as much about what does NOT cross as about what does. The wall is F6's single ruled
// exception: a clamped NUMERIC score may cross; arcs, twists and guidance never do.

/** #16's cadence + threshold, chosen so ONE seeded batch drives both rules: 8 beats ⇒ 8 % 4 == 0. */
const NEEDLE_BEATS = 8;
const NEEDLE_CADENCE = 4;
const NEEDLE_THRESHOLD = 6;

/** A pass reply that ALSO carries the fields the needle's arm never enabled — the wall's raw material. A
 *  non-enforcing vehicle CAN emit them; the point of the pin is that they die server-side. */
function needleReply(score: number): string {
  return JSON.stringify({
    arcStatus: "active",
    updatedArc: "the harbour debt comes due",
    successorArc: null,
    twistOps: [{ op: "add", twist: "the harbourmaster is lying" }],
    score,
    // NEITHER of these is a field this arm's schema declares (no steer route, no lore route) — a stray key
    // from a non-enforcing vehicle, which is exactly what the server-side zod must strip.
    guidance: "Plant the harbourmaster's lie and let it fester.",
    lore: [{ key: "harbour", keys: ["harbour"], content: "The harbour is corrupt." }],
  });
}

describe("§4 #16 the needle (the score → meter + backdrop pair)", () => {
  test("the stored set is the needle shape: a vars-ONLY analysis read, then the threshold backdrop rule — born disabled", async () => {
    const f = await setup();
    const views = await f.svc.createRuleFromPreset({
      timeZone: UTC_TIME_ZONE,
      principal: principal(f.host),
      chatId: f.chatId,
      presetId: "theNeedle",
      knobs: { everyN: NEEDLE_CADENCE, threshold: NEEDLE_THRESHOLD },
    });

    expect(views.map((v) => v.name)).toEqual(["The needle (1/2)", "The needle (2/2)"]);
    // OFF BY DEFAULT is mechanical, not a knob: `createRule` mints every rule disabled and enabling is the
    // consent act, so a host opts a ROOM in twice (adding the preset, then enabling it). This assertion IS
    // the ruling's "no room is born with it enabled".
    expect(views.map((v) => v.enabled)).toEqual([false, false]);
    // The read half authors the vars route and NOTHING else (the def half of F6's wall).
    expect(nth(views, 0).actions[0]).toMatchObject({ type: "run_analysis", routes: { vars: { key: "tension" } } });
    const read = nth(views, 0).actions[0];
    expect(Object.keys(read?.type === "run_analysis" ? read.routes : {})).toEqual(["vars"]);
    // The reaction half reads the score the first rule wrote, guarded (law 1) and coerced (law 2).
    expect(nth(views, 1).predicateCel).toContain("has(vars.tension) && int(vars.tension) >= 6");
    expect(nth(views, 1).actions[0]).toMatchObject({ type: "set_chat_background" });
    // Position order is the same-batch mechanism: the score must be written before the threshold reads it.
    expect(nth(views, 0).position).toBeLessThan(nth(views, 1).position);
  });

  test("create → fire: the cadence beat scores the scene into the member-visible var and the backdrop re-dresses in the SAME batch", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "theNeedle", { everyN: NEEDLE_CADENCE, threshold: NEEDLE_THRESHOLD });
    const background = armBackdrop(f);
    await f.seedBeats(NEEDLE_BEATS);
    f.setQuietReply(needleReply(9));

    await f.svc.handleEvent(turnCompleted(f.chatId)); // messageCount 8 ⇒ 8 % 4 == 0

    // The score crossed — as a CLAMPED INTEGER STRING, the only shape the applier can write.
    expect(f.vars["tension"]).toBe("9");
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);
    // …and the sibling rule read it IN THE SAME BATCH (the dispatch's shared-env write-through), fired, and
    // the room actually re-dressed itself. Two quiet calls, in order: the analysis pass, then the autobg pick.
    expect(f.quietCalls.map((c) => c.posture)).toEqual(["rule_analysis", "autobg"]);
    expect(await outcomes(f, nth(views, 1))).toEqual(["fired"]);
    expect(f.backgroundsSet).toEqual([background]);
    // The host's bias rode the pick's prompt (the knob's whole job).
    expect(f.quietCalls[1]?.prompt).toContain("Guidance: Choose the most charged, high-stakes backdrop");
  });

  test("F6's WALL, from this preset's own path: a pass that emits guidance/lore alongside the score publishes ONLY the score", async () => {
    // THE RULING: "a published analysis SCORE may cross into the member-visible vars plane; arcs, twists and
    // guidance NEVER do." The model reply above carries guidance AND lore AND an arc AND a twist. The arm
    // enabled only `vars`, so `buildAnalysisPayloadSchema` omits the guidance/lore fields entirely and the
    // server-side zod STRIPS them before any applier runs — a receipt that does not depend on the model
    // behaving, which is the point (an enforcing vehicle could not emit them at all; a non-enforcing one can).
    const f = await setup();
    const views = await mintAndEnable(f, "theNeedle", { everyN: NEEDLE_CADENCE, threshold: NEEDLE_THRESHOLD });
    armBackdrop(f);
    await f.seedBeats(NEEDLE_BEATS);
    f.setQuietReply(needleReply(9));

    await f.svc.handleEvent(turnCompleted(f.chatId));

    // The member-visible plane carries the score and NOTHING ELSE — no guidance, no arc, no twist, and no
    // second key of any kind.
    expect(Object.keys(f.vars)).toEqual(["tension"]);
    const state = await selectRuleState(f.db, castId<AutomationRuleId>(nth(views, 0).id));
    // Guidance never even reached the durable HOST-ONLY store: no steer route was authored, so the stripped
    // field could not be staged for the end-of-pass write.
    expect(state.guidance).toBe("");
    // The private plot state DID advance (the pass always maintains its own banks) — and it lives in the
    // rule-state row, which has no member read surface at all. That asymmetry IS the wall.
    expect(state.state.arc).toBe("the harbour debt comes due");
    expect(state.state.twists).toEqual(["the harbourmaster is lying"]);
    // The stripped lore never wrote and never raised a card.
    expect(await f.db.select().from(worldEntries)).toEqual([]);
    expect(f.suggestions.countForChat(f.chatId)).toBe(0);
  });

  test("under the threshold the backdrop holds — the reaction rule refuses on its own predicate, spending nothing", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "theNeedle", { everyN: NEEDLE_CADENCE, threshold: NEEDLE_THRESHOLD });
    armBackdrop(f);
    await f.seedBeats(NEEDLE_BEATS);
    f.setQuietReply(needleReply(2));

    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.vars["tension"]).toBe("2");
    // No fire row for the reaction rule, and the EMPTY list is the honest expectation rather than a
    // `predicate_false` one: the engine logs that terminal only for a rule that has fired at least once
    // (`engine/dispatch.ts` — the lean first-match debug log), and this one never has.
    expect(await outcomes(f, nth(views, 1))).toEqual([]);
    expect(f.backgroundsSet).toEqual([]);
    // Only the analysis call was spent — a refused predicate never reaches the autobg pick.
    expect(f.quietCalls.map((c) => c.posture)).toEqual(["rule_analysis"]);
  });

  test("the score is CLAMPED to the dial, not trusted: an out-of-range model number lands at the bound", async () => {
    const f = await setup();
    await mintAndEnable(f, "theNeedle", { everyN: NEEDLE_CADENCE, threshold: NEEDLE_THRESHOLD });
    armBackdrop(f);
    await f.seedBeats(NEEDLE_BEATS);
    // 40 is outside the schema's own 0..10 bound, so this is the NON-ENFORCING-vehicle case: the payload
    // zod refuses it, `runStructuredTurn` retries once, and the pass fails typed rather than writing 40.
    f.setQuietReply(needleReply(40));

    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.vars["tension"]).toBeUndefined();
    expect(f.backgroundsSet).toEqual([]);
  });

  test("mint REFUSES on an active-game chat — the needle is an analysis preset like any other (D109)", async () => {
    const f = await setup();
    await f.db.insert(rpgGames).values({
      id: mintTypeId(ID_PREFIX.rpgGame),
      chatId: f.chatId,
      mode: "lite",
      status: "active",
      config: rpgGameConfigSchema.parse({}),
    });
    await expect(
      f.svc.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, principal: principal(f.host), chatId: f.chatId, presetId: "theNeedle" }),
    ).rejects.toThrow("directs its own story");
    expect(await f.svc.listRules({ principal: principal(f.host), chatId: f.chatId })).toEqual([]);
  });
});
