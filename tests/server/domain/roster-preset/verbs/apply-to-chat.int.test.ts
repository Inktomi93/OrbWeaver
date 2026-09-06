// verb: applyToChat — the injected-op DRIVE semantics over the recording chat fakes: the host gate runs
// FIRST (before any target-room read — the roster-intersection-oracle closure), members apply
// SEQUENTIALLY in position order, added-vs-alreadyPresent classifies off the pre-read, knobs re-stamp
// on EVERY apply (disabled always, talkativeness only when stored), the config arm fires only when a
// blob is stored, and a mid-apply-vanished character is SKIPPED, never an abort. The composed-real
// proof of the SAME behavior over the real chat verbs is tests/server/entry/compose/roster-preset.int.test.ts.

import type { RulePresetId } from "@orb/contracts/automation";
import type { RosterPresetView } from "@orb/contracts/roster-preset";
import { characters, rosterPresetRules } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import type { RosterPresetService } from "@orb/server/domain/roster-preset";
import { createRosterPresetService, RosterPresetNotFoundError } from "@orb/server/domain/roster-preset";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, memberSpec, principal, seededRuleView } from "../_support.ts";

const CHAT = castId<ChatId>("chat_target");

describe("applyToChat", () => {
  test("fresh room: every member added in POSITION order, knobs stamped per member, no config touch sans blob", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const b = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({
      principal: principal(owner),
      input: { name: "Cast", description: "", members: [memberSpec(b, 0, { talkativeness: 0.8 }), memberSpec(a, 1, { disabled: true })] },
    });

    const result = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });

    expect(result).toEqual({
      added: [b, a],
      alreadyPresent: [],
      skipped: [],
      configApplied: false,
      rulesMinted: [],
      rulesAlreadyPresent: [],
      rulesSkipped: [],
    });
    // Position order IS join order (b stored at position 0 wins the first add).
    expect(h.adds.map((x) => x.characterId)).toEqual([b, a]);
    // Knobs: talkativeness rides only when stored non-null; disabled ALWAYS rides (NOT NULL column).
    expect(h.knobs.map((x) => x.patch)).toEqual([{ disabled: false, talkativeness: 0.8 }, { disabled: true }]);
    expect(h.configs).toHaveLength(0);
    expect(h.audits.map((x) => x.entry.action)).toContain("rosterPreset.applyToChat");
    // An apply never emits the LIBRARY bus member (the chat fans its own freshness).
    expect(h.userEvents.filter((e) => e.event.type === "rosterPresetsChanged").map((e) => e.event)).toHaveLength(1); // the create only
  });

  test("re-apply is additive-idempotent: nothing re-added, knobs RE-stamped on the live seats", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({
      principal: principal(owner),
      input: { name: "Solo", description: "", members: [memberSpec(a, 0, { talkativeness: 0.3 })] },
    });

    const first = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });
    const again = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });

    expect(first.added).toEqual([a]);
    expect(again).toEqual({ added: [], alreadyPresent: [a], skipped: [], configApplied: false, rulesMinted: [], rulesAlreadyPresent: [], rulesSkipped: [] });
    // ONE add ever; TWO knob stamps (one per apply), the second against the SAME participantId.
    expect(h.adds).toHaveLength(1);
    expect(h.knobs).toHaveLength(2);
    expect(h.knobs[0]?.participantId).toBe(h.knobs[1]?.participantId);
  });

  test("a stored groupConfig lands through the injected setGroupConfig (parse-at-apply), flagged in the result", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({
      principal: principal(owner),
      input: { name: "Narrated", description: "", groupConfig: { output: "narrator", policy: "list" }, members: [memberSpec(a, 0)] },
    });

    const result = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });
    expect(result.configApplied).toBe(true);
    expect(h.configs).toHaveLength(1);
    expect(h.configs[0]?.config).toMatchObject({ output: "narrator", policy: "list" });
  });

  test("the HOST GATE runs FIRST: a refusing requireHost surfaces chat's own error with ZERO room reads/writes", async () => {
    const db = await freshDb();
    const h = makeHarness(db, {});
    // Override the injected guard to CHAT's own leak-free refusal — asserted THROUGH the op, proving no
    // second authority path (and no pre-read leak) exists on the refusing arm.
    const refusing = makeHarness(db, {
      chat: {
        ...h.ctx.chat,
        requireHost: (): Promise<void> => Promise.reject(new ChatNotFoundError(CHAT)),
      },
    });
    const svc = createRosterPresetService(refusing.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({ principal: principal(owner), input: { name: "Mine", description: "", members: [memberSpec(a, 0)] } });

    await expect(svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT })).rejects.toBeInstanceOf(ChatNotFoundError);
    // NOTHING room-shaped fired: no add, no knob, no config — and the all-present no-op oracle is closed
    // because even the classification pre-read sits behind the guard. The spread ops RECORD INTO `h`'s
    // arrays (the override reuses them), so `h` is where a leaked call would land — and the sibling tests
    // above are the positive control that these arrays do capture calls when the guard passes.
    expect(h.adds).toHaveLength(0);
    expect(h.knobs).toHaveLength(0);
    expect(h.configs).toHaveLength(0);
  });

  test("a foreign presetId refuses leak-free BEFORE the host gate ever fires", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const stranger = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({ principal: principal(owner), input: { name: "Mine", description: "", members: [memberSpec(a, 0)] } });

    await expect(svc.applyToChat({ principal: principal(stranger), presetId: preset.id, chatId: CHAT })).rejects.toBeInstanceOf(RosterPresetNotFoundError);
    expect(h.hostChecks).toHaveLength(0);
  });

  test("a member whose character vanished mid-apply is SKIPPED (reported), the survivors land", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const keep = (await seedCharacter(db, { ownerId: owner })).id;
    const doomed = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({
      principal: principal(owner),
      input: { name: "Raced", description: "", members: [memberSpec(doomed, 0), memberSpec(keep, 1)] },
    });

    // Simulate the delete-mid-apply race the FK CASCADE otherwise erases: hard-delete the character row
    // (its seat row cascades with it in production; here we model the widest window). PRAGMA cascades run
    // on the real db, so the member row is gone too — the re-verify belt reports what the read no longer
    // holds vs what the preset VIEW claimed... the surviving member still applies.
    await db.delete(characters).where(eq(characters.id, doomed));

    const result = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });
    // The cascade already removed the doomed seat row, so it is neither added nor skipped — the honest
    // outcome of FK physics; `skipped` stays the reporting arm for the sub-cascade race window.
    expect(result.added).toEqual([keep]);
    expect(h.adds.map((x) => x.characterId)).toEqual([keep]);
  });
});

// ── B10's rules rider (build record §6.4/§6.5) — over the harness's recording automation plane ──────────
describe("applyToChat — the rules phase", () => {
  interface RuledCastFixture {
    readonly svc: RosterPresetService;
    readonly owner: UserId;
    readonly cast: RosterPresetView;
  }

  async function ruledCast(db: Awaited<ReturnType<typeof freshDb>>, h: ReturnType<typeof makeHarness>): Promise<RuledCastFixture> {
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const cast = await svc.create({
      principal: principal(owner),
      input: {
        name: "Ruled",
        description: "",
        members: [memberSpec(a, 0)],
        rules: [
          { rulePresetId: "sceneVeil", knobs: { veilWord: "((fade))" } },
          { rulePresetId: "clockFires", knobs: { n: 6 } },
        ],
      },
    });
    return { svc, owner, cast };
  }

  test("fresh room: every cast rule minted IN CAST ORDER with the stored bag, then ENABLED (the apply is the consent act)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cast } = await ruledCast(db, h);

    const result = await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });

    expect(h.ruleMints.map((m) => m.rulePresetId)).toEqual(["sceneVeil", "clockFires"]);
    expect(h.ruleMints[0]?.knobs).toMatchObject({ veilWord: "((fade))" });
    expect(h.ruleMints[1]?.knobs).toMatchObject({ n: 6 });
    // 1 + 2 rules minted, EVERY one flipped on through automation's own consent verb.
    expect(h.roomRules).toHaveLength(3);
    expect(h.roomRules.every((rule) => rule.enabled)).toBe(true);
    expect(h.ruleEnables.map((e) => e.enabled)).toEqual([true, true, true]);
    expect(result.rulesMinted).toEqual(["sceneVeil", "clockFires"]);
    expect(result.rulesAlreadyPresent).toEqual([]);
    expect(result.rulesSkipped).toEqual([]);
  });

  test("re-apply is idempotent: complete knob-equal groups classify alreadyPresent — zero mints, zero deletes, zero re-enables", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cast } = await ruledCast(db, h);
    await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });
    const mintsAfterFirst = h.ruleMints.length;
    const enablesAfterFirst = h.ruleEnables.length;

    const again = await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });

    expect(again.rulesMinted).toEqual([]);
    expect(again.rulesAlreadyPresent).toEqual(["sceneVeil", "clockFires"]);
    expect(h.ruleMints).toHaveLength(mintsAfterFirst);
    expect(h.ruleDeletes).toEqual([]);
    // Already enabled ⇒ the re-assert loop had nothing to flip.
    expect(h.ruleEnables).toHaveLength(enablesAfterFirst);
    expect(h.roomRules).toHaveLength(3);
  });

  test("a DISABLED-but-matching group is re-ENABLED on re-apply (the member knob re-stamp's rule twin)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cast } = await ruledCast(db, h);
    await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });
    // The host toggled one rule off since — the cast re-asserts its all-enabled semantics.
    const veil = h.roomRules.find((rule) => rule.rulePresetId === "sceneVeil");
    if (veil === undefined) {
      throw new Error("premise: the veil rule minted");
    }
    const index = h.roomRules.findIndex((rule) => rule.id === veil.id);
    h.roomRules[index] = { ...veil, enabled: false };

    const again = await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });
    expect(again.rulesAlreadyPresent).toContain("sceneVeil");
    expect(h.ruleEnables.at(-1)).toEqual({ ruleId: veil.id, enabled: true });
    expect(h.ruleMints.filter((m) => m.rulePresetId === "sceneVeil")).toHaveLength(1); // still ONE mint ever
  });

  test("KNOB DRIFT replaces: the room's group is deleted and re-minted with the CAST's bag (the cast is the single authority)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cast } = await ruledCast(db, h);
    await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });
    // Drift the room's veil bag out from under the cast (models a later re-mint with other knobs).
    const veil = h.roomRules.find((rule) => rule.rulePresetId === "sceneVeil");
    if (veil === undefined || veil.rulePresetKnobs === null) {
      throw new Error("premise: the veil rule minted with provenance");
    }
    const index = h.roomRules.findIndex((rule) => rule.id === veil.id);
    h.roomRules[index] = { ...veil, rulePresetKnobs: { ...veil.rulePresetKnobs, veilWord: "((other))" } };

    const again = await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });

    expect(again.rulesMinted).toEqual(["sceneVeil"]);
    expect(again.rulesAlreadyPresent).toEqual(["clockFires"]);
    expect(h.ruleDeletes).toEqual([veil.id]);
    const fresh = h.roomRules.find((rule) => rule.rulePresetId === "sceneVeil");
    expect(fresh?.rulePresetKnobs).toMatchObject({ veilWord: "((fade))" });
    expect(fresh?.enabled).toBe(true);
  });

  test("an INCOMPLETE set (a half-mint) replaces — retry converges instead of classifying alreadyPresent forever", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cast } = await ruledCast(db, h);
    await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });
    // Model the aborted-earlier-apply state: one of the clock's TWO rules is gone.
    const clockRule = h.roomRules.find((rule) => rule.rulePresetId === "clockFires");
    if (clockRule === undefined) {
      throw new Error("premise: the clock set minted");
    }
    h.roomRules.splice(
      h.roomRules.findIndex((rule) => rule.id === clockRule.id),
      1,
    );

    const again = await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });

    expect(again.rulesMinted).toEqual(["clockFires"]);
    // The surviving half was deleted before the fresh full set minted.
    expect(h.ruleDeletes).toHaveLength(1);
    expect(h.roomRules.filter((rule) => rule.rulePresetId === "clockFires")).toHaveLength(2);
  });

  test("a MINT REFUSAL (automation's own validation class) collects into rulesSkipped with its reason — the siblings still land", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cast } = await ruledCast(db, h);
    // The planted consent-class refusal (the lore presets' book-attachment gate raises exactly this
    // class on the REAL graph — proven in tests/server/entry/compose/roster-preset.int.test.ts).
    h.refuseMints.set("sceneVeil", "that world book is not attached to this chat");

    const result = await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });

    expect(result.rulesSkipped).toEqual([{ rulePresetId: "sceneVeil", reason: "that world book is not attached to this chat" }]);
    expect(result.rulesMinted).toEqual(["clockFires"]);
    expect(h.roomRules.filter((rule) => rule.rulePresetId === "clockFires")).toHaveLength(2);
    expect(h.roomRules.filter((rule) => rule.rulePresetId === "sceneVeil")).toHaveLength(0);
  });

  test("a STALE catalogue id (stored before a removal) degrades to a reported skip, never a crash", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cast } = await ruledCast(db, h);
    // The wire's closed enum makes this unmintable through create — plant it AT REST, the state a
    // catalogue removal would leave behind (the column carries no CHECK for exactly this reason).
    await db.insert(rosterPresetRules).values({
      presetId: cast.id,
      // The one sanctioned lie in this suite: the column carries no CHECK precisely so a removal-orphaned
      // id can exist AT REST; the closed union has no member to spell it, hence the cast.
      rulePresetId: "retiredPreset" as RulePresetId,
      position: 2,
      knobs: {},
    });

    const result = await svc.applyToChat({ principal: principal(owner), presetId: cast.id, chatId: CHAT });

    expect(result.rulesSkipped).toEqual([{ rulePresetId: "retiredPreset", reason: "this rule preset is no longer offered" }]);
    expect(result.rulesMinted).toEqual(["sceneVeil", "clockFires"]);
  });

  test("a NON-refusal failure (a dying room's NotFound) SURFACES and aborts — never silently collected", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const base = await ruledCast(db, h);
    const failingCtx = {
      ...h.ctx,
      automation: {
        ...h.ctx.automation,
        createRuleFromPreset: (): Promise<never> => Promise.reject(new ChatNotFoundError(CHAT)),
      },
    };
    const svc = createRosterPresetService(failingCtx);

    await expect(svc.applyToChat({ principal: principal(base.owner), presetId: base.cast.id, chatId: CHAT })).rejects.toBeInstanceOf(ChatNotFoundError);
  });

  test("a SANS-RULES cast performs ZERO automation ops — not even the classification read (the planted control)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const plain = await svc.create({ principal: principal(owner), input: { name: "Plain", description: "", members: [memberSpec(a, 0)] } });
    // The room HAS rules (planted) — an over-eager rules phase would see and touch them.
    h.roomRules.push(
      seededRuleView({
        id: castId<AutomationRuleId>("automation_rule_preexisting"),
        chatId: CHAT,
        name: "hands off",
        enabled: true,
        position: 0,
        rulePresetId: "pacingNudge",
        rulePresetKnobs: { everyN: 8, steer: "x" },
      }),
    );

    const result = await svc.applyToChat({ principal: principal(owner), presetId: plain.id, chatId: CHAT });

    expect(result.rulesMinted).toEqual([]);
    expect(result.rulesAlreadyPresent).toEqual([]);
    expect(result.rulesSkipped).toEqual([]);
    expect(h.ruleListReads.count).toBe(0);
    expect(h.ruleMints).toEqual([]);
    expect(h.ruleEnables).toEqual([]);
    expect(h.ruleDeletes).toEqual([]);
    // The planted room rule is byte-untouched.
    expect(h.roomRules[0]?.enabled).toBe(true);
    expect(h.roomRules).toHaveLength(1);
  });
});
