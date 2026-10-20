// S3 — the preset MINT, end to end: every committed §4 preset is minted through the REAL `createRuleFromPreset`
// verb into a real db, enabled, and then FIRED through the REAL dispatch engine with the REAL arm executors.
// A preset that stores but never fires (a predicate the live env can't satisfy, an arm shape the validator
// refuses, a counter the rate cap freezes) is the failure mode these exist for — a stored-rule assertion alone
// would not have caught any of them.
//
// The harness runs the REAL `createArmExecutors` over a CAPTURING `AutomationOps` with a LIVE variable store:
// `applyVariableOps` folds into it and `readVariables` serves it back, so a clock genuinely fills across
// batches and the two-rule presets' same-batch write-through (`engine/arm-executors.ts:88-98`) is exercised
// rather than assumed. Deterministic throughout: the harness's injected fixed clock + prng, no `Date.now`.
//
// `chat.messageCount` is a REAL count over seeded rows (`persistence/canon-reads.ts` countChatMessages), so
// the cadence predicates are driven by seeding messages — not by stubbing the env.
// @subject packages/server/src/domain/automation/verbs/create-rule-from-preset.ts

import type { AutomationAction } from "@orb/contracts/automation";
import { RULE_PRESET_IDS } from "@orb/contracts/automation";
import { parseIanaTimeZone, UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { MSG_COMMITTED, principal, SET_VAR, seedUser } from "../_support.ts";
import { mintAndEnable, nth, setup } from "./_create-rule-from-preset-support.ts";

const BAD_KNOB = /knob 'everyN'/;

// ── the mint's own contract ──────────────────────────────────────────────────────────────────────────

describe("createRuleFromPreset — the mint", () => {
  test("mints a single-rule preset under its bare title, born DISABLED, with the knobs substituted", async () => {
    const f = await setup();
    const [view] = await f.svc.createRuleFromPreset({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(f.db, f.host),
      chatId: f.chatId,
      presetId: "pacingNudge",
      knobs: { everyN: 4, steer: "Shift the pacing." },
    });

    expect(view?.name).toBe("Periodic pacing nudge"); // no "(1/1)" on a single-rule set
    expect(view?.enabled).toBe(false); // enabling is the consent act — createRule's law, unchanged
    expect(view?.predicateCel).toBe("int(chat.messageCount) % 4 == 0");
    // The stored arm is the PARSED one: `confirmFirst` is defaulted in by the schema, so a rule authored
    // without the flag is explicitly a DIRECT rule rather than an ambiguous absence.
    expect(view?.actions).toEqual([{ type: "trigger_turn", guidedTemplate: "Shift the pacing.", confirmFirst: false }]);
    expect(view?.trigger).toEqual({ bus: "chat", type: "turnCompleted" });
  });

  test("mints a two-rule preset as an ORDERED, (i/n)-titled set at ascending positions", async () => {
    const f = await setup();
    const views = await f.svc.createRuleFromPreset({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(f.db, f.host),
      chatId: f.chatId,
      presetId: "clockFires",
    });

    expect(views.map((v) => v.name)).toEqual(["Clock fires when full (1/2)", "Clock fires when full (2/2)"]);
    // Position order IS the same-batch mechanism: the counter must dispatch before the threshold.
    expect(nth(views, 0).position).toBeLessThan(nth(views, 1).position);
    expect(views[0]?.actions[0]).toMatchObject({ type: "set_variable", key: "clock", op: "inc" });
    // Law 4 — the counter half carries the explicit high cap; the threshold half keeps the default.
    expect(views[0]?.maxFiresPerHour).toBe(240);
    expect(views[1]?.maxFiresPerHour).toBe(30);
  });

  test("every rule of a minted set reads its clock in the minting host's zone", async () => {
    const f = await setup();
    const kathmandu = parseIanaTimeZone("Asia/Kathmandu");
    if (kathmandu === null) {
      throw new Error("the platform must know Asia/Kathmandu");
    }
    const views = await f.svc.createRuleFromPreset({ timeZone: kathmandu, principal: await principal(f.db, f.host), chatId: f.chatId, presetId: "clockFires" });

    expect(views.map((view) => view.timeZone)).toEqual(["Asia/Kathmandu", "Asia/Kathmandu"]);
  });

  // #1427 — a preset SET is one act. It used to commit rule-by-rule through the whole `createRule` verb, so
  // an n-rule preset emitted n `rulesChanged` for one host click (and allocated n positions from n separate
  // read-then-write pairs). It is now planned whole, then committed in ONE batch, and announced ONCE.
  test("a multi-rule preset announces the roster ONCE, not once per member", async () => {
    const f = await setup();
    f.bus.length = 0;

    const views = await f.svc.createRuleFromPreset({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(f.db, f.host),
      chatId: f.chatId,
      presetId: "clockFires",
    });

    expect(views).toHaveLength(2);
    expect(f.bus.filter((event) => event.type === "rulesChanged")).toEqual([{ type: "rulesChanged", chatId: f.chatId }]);
  });

  test("the set lands at CONTIGUOUS ascending positions, continuing the chat's existing order", async () => {
    const f = await setup();
    // A hand-authored rule already holds position 0 in this scope.
    await f.svc.createRule({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(f.db, f.host),
      chatId: f.chatId,
      name: "hand-authored",
      trigger: MSG_COMMITTED,
      actions: [SET_VAR],
    });

    const views = await f.svc.createRuleFromPreset({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(f.db, f.host),
      chatId: f.chatId,
      presetId: "clockFires",
    });

    // Allocated inside the batch, off one snapshot: 1 then 2, with no gap and no collision with the 0.
    expect(views.map((v) => v.position)).toEqual([1, 2]);
    const listed = await f.svc.listRules({ principal: await principal(f.db, f.host), chatId: f.chatId });
    expect(listed.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  test("refuses a bad knob with a typed validation error and stores NOTHING", async () => {
    const f = await setup();
    await expect(
      f.svc.createRuleFromPreset({
        timeZone: UTC_TIME_ZONE,
        principal: await principal(f.db, f.host),
        chatId: f.chatId,
        presetId: "pacingNudge",
        knobs: { everyN: 5000 },
      }),
    ).rejects.toThrow(BAD_KNOB);
    expect(await f.svc.listRules({ principal: await principal(f.db, f.host), chatId: f.chatId })).toEqual([]);
  });

  test("is HOST-gated through the same guard as createRule — a non-member never learns the chat exists", async () => {
    const f = await setup();
    const stranger = await seedUser(f.db, "user_stranger");
    await expect(
      f.svc.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, principal: await principal(f.db, stranger), chatId: f.chatId, presetId: "cutaways" }),
    ).rejects.toThrow();
    expect(await f.svc.listRules({ principal: await principal(f.db, f.host), chatId: f.chatId })).toEqual([]);
  });

  test("stamps MINT PROVENANCE on every rule of the set — the id + the COMPLETE resolved bag, not the partial overrides (§3-S3 flip shape)", async () => {
    const f = await setup();
    // Partial overrides: `steer` rides its descriptor default, so the stored bag must carry BOTH keys.
    const views = await f.svc.createRuleFromPreset({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(f.db, f.host),
      chatId: f.chatId,
      presetId: "clockFires",
      knobs: { n: 6 },
    });
    expect(views).toHaveLength(2);
    for (const view of views) {
      expect(view.rulePresetId).toBe("clockFires");
      expect(view.rulePresetKnobs).toEqual({
        n: 6,
        firedArm: "narrate",
        firedText: "The pressure that has been building finally breaks into the scene.",
      });
    }
    // The projection survives the round trip — listRules serves the same provenance.
    const listed = await f.svc.listRules({ principal: await principal(f.db, f.host), chatId: f.chatId });
    expect(listed.map((rule) => rule.rulePresetId)).toEqual(["clockFires", "clockFires"]);
  });

  test("a HAND-authored rule carries the NULL provenance pair (the biconditional's other side)", async () => {
    const f = await setup();
    const view = await f.svc.createRule({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(f.db, f.host),
      chatId: f.chatId,
      name: "hand-made",
      trigger: { bus: "chat", type: "messageCommitted" },
      predicateCel: null,
      actions: [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }],
    });
    expect(view.rulePresetId).toBeNull();
    expect(view.rulePresetKnobs).toBeNull();
  });
});

// ── the picker read model, over the same registry the mint uses ───────────────────────────────────────

test("listRulePresets projects every committed preset in catalogue order and carries no CEL", async () => {
  const f = await setup();
  const views = f.svc.listRulePresets();

  expect(views.map((v) => v.id)).toEqual([...RULE_PRESET_IDS]);
  // Each declared ruleCount is the count the MINT actually produces — the picker's "(i/n)" promise.
  const clock = await f.svc.createRuleFromPreset({
    timeZone: UTC_TIME_ZONE,
    principal: await principal(f.db, f.host),
    chatId: f.chatId,
    presetId: "clockFires",
  });
  expect(clock).toHaveLength(views.find((v) => v.id === "clockFires")?.ruleCount ?? 0);
  expect(JSON.stringify(views)).not.toContain("vars.");
});

// A minted arm list is a real `AutomationAction[]` — the type pin (the arms are typed against the action
// union, not stringly built), read back off the stored row.
test("minted arms round-trip as real AutomationActions off the stored row", async () => {
  const f = await setup();
  const views = await mintAndEnable(f, "illustrateScenes");
  const stored: readonly AutomationAction[] = nth(views, 0).actions;
  expect(stored[0]?.type).toBe("generate_image");
});
