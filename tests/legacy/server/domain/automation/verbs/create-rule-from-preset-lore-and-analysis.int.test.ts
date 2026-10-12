// S3 — the story pacing analysis (C1) and the lore distillers (C2) minted and FIRED through the real verb and engine.
// @subject packages/server/src/domain/automation/verbs/create-rule-from-preset.ts

import type { AutomationAction } from "@orb/contracts/automation";
import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import { chatBooks, rpgGames, worldBooks, worldEntries } from "@orb/db";
import type { AutomationRuleId, WorldBookId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { ZWSP } from "@orb/kit/macro";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { FIXED_NOW_MS, principal } from "../_support.ts";
import type { Fixture } from "./_create-rule-from-preset-support.ts";
import { mintAndEnable, NO_BOOK, nth, outcomes, selectRuleState, setup, turnCompleted, UNATTACHED_BOOK } from "./_create-rule-from-preset-support.ts";

describe("§4 #15 story pacing analysis (C1 — RULED F7 direct steer)", () => {
  test("create → fire through the real engine: the cadence beat runs ONE quiet pass and the guidance line lands verbatim", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "storyPacing", { everyN: 2, steer: "slow burn" });
    // The stored arm is the pacing shape: steer route only, DIRECT (the ruling), the host steer substituted.
    expect(nth(views, 0).actions[0]).toMatchObject({ type: "run_analysis", steer: "slow burn", routes: { steer: { apply: "direct" } } });

    await f.seedBeats(2);
    f.setQuietReply(
      JSON.stringify({
        arcStatus: "active",
        updatedArc: "the debt comes due",
        successorArc: null,
        twistOps: [{ op: "add", twist: "the missing courier" }],
        guidance: "Plant the courier's absence without explaining it.",
      }),
    );
    await f.svc.handleEvent(turnCompleted(f.chatId)); // messageCount 2 ⇒ 2 % 2 == 0

    expect(f.quietCalls).toHaveLength(1);
    // The host's standing direction rode the pass's user prompt (the steer knob's whole job).
    expect(f.quietCalls[0]?.prompt).toContain("Host's standing direction (obey it): slow burn");
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);
    // The guidance + plot state landed on the rule-state row, VERBATIM.
    const stored = await selectRuleState(f.db, castId<AutomationRuleId>(nth(views, 0).id));
    expect(stored.guidance).toBe("Plant the courier's absence without explaining it.");
    expect(stored.state.arc).toBe("the debt comes due");
    expect(stored.state.twists).toEqual(["the missing courier"]);

    // Off the cadence: the predicate stays silent and NO model call is spent.
    await f.seedBeats(1);
    await f.svc.handleEvent(turnCompleted(f.chatId));
    expect(f.quietCalls).toHaveLength(1);
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired", "predicate_false"]);
  });

  test("mint REFUSES on an active-game chat — the game owns its own steering (D109; §3-S5.7)", async () => {
    const f = await setup();
    await f.db.insert(rpgGames).values({
      id: mintTypeId(ID_PREFIX.rpgGame),
      chatId: f.chatId,
      mode: "lite",
      status: "active",
      config: rpgGameConfigSchema.parse({}),
    });
    await expect(
      f.svc.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, principal: principal(f.host), chatId: f.chatId, presetId: "storyPacing" }),
    ).rejects.toThrow("directs its own story");
    expect(await f.svc.listRules({ principal: principal(f.host), chatId: f.chatId })).toEqual([]);
  });
});

// ── §4 #11 C2's confirm-first lore distillers (distillLore + rumorMill) ────────────────────────────────
// Both ride the C1 `run_analysis` → `upsertLoreEntry` route (confirm-first, RULED F7), differing only in the
// analysis BRIEF. The correctness heart is the settled-span read + HIGH-WATER MARK (idempotent on re-run) and
// `neutralizeMacros` on the model→lore bytes — both C1 engine mechanisms these presets consume, pinned here at
// the create→fire level through the REAL engine.

/** 20 seeded beats ⇒ maxSeq 20; the arm's PROTECT_TAIL is 16, so the settled span the first pass reads is
 *  (0, 4]. Firing on cadence everyN=4 (20 % 4 == 0) fires AND leaves a settled span in one shot. */
const DISTILL_BEATS = 20;
const DISTILL_CADENCE = 4;
const DISTILL_SPAN_END = 4;

/** Seed a world book attached to the fixture's chat — the room's consent the lore belt gates on. A MINTED
 *  TypeID: the arm schema's `bookId` validates the 26-char suffix, so a hand-spelled id would refuse at parse. */
async function seedAttachedBook(f: Fixture): Promise<WorldBookId> {
  const bookId = mintTypeId(ID_PREFIX.worldBook);
  await f.db.insert(worldBooks).values({ id: bookId, ownerId: f.host, name: "distilled lore" });
  await f.db.insert(chatBooks).values({ chatId: f.chatId, worldBookId: bookId });
  return bookId;
}

/** A canned analysis reply distilling ONE lore entry whose key + content carry a MODEL-authored macro — the
 *  neutralization pin's raw material (law 7: model bytes entering world-info's macro-execution plane are
 *  `neutralizeMacros`'d at the write boundary, so `{{setvar}}` must survive only as literal braces). */
function loreReply(key: string): string {
  return JSON.stringify({
    arcStatus: "active",
    updatedArc: null,
    successorArc: null,
    twistOps: [],
    lore: [{ key, keys: ["courier"], content: "The courier vanished on the north road. {{setvar::x::1}}" }],
  });
}

describe("§4 #11 distill lore (C2 — confirm-first, the settled-span watermark)", () => {
  test("the stored arm is the distill shape: a confirm-first lore route into the chosen book, typed against the action union", async () => {
    const f = await setup();
    const bookId = await seedAttachedBook(f);
    const views = await mintAndEnable(f, "distillLore", { everyN: DISTILL_CADENCE, bookId });

    expect(nth(views, 0).name).toBe("Distill lore"); // single rule ⇒ bare title
    const stored: readonly AutomationAction[] = nth(views, 0).actions;
    expect(stored[0]).toMatchObject({ type: "run_analysis", routes: { lore: { apply: "confirm", bookId } } });
    // The brief carries the keeper semantics (durable facts, merge-not-repeat, no unrevealed secrets).
    expect(stored[0]?.type === "run_analysis" ? stored[0].brief : "").toContain("distill the durable facts");
  });

  test("create → fire: the cadence beat distills lore from the SETTLED span onto a confirm CARD — neutralized + span-stamped, and NOTHING is written yet", async () => {
    const f = await setup();
    const bookId = await seedAttachedBook(f);
    const views = await mintAndEnable(f, "distillLore", { everyN: DISTILL_CADENCE, bookId });
    const ruleId = castId<AutomationRuleId>(nth(views, 0).id);
    await f.seedBeats(DISTILL_BEATS);
    f.setQuietReply(loreReply("the-courier"));

    await f.svc.handleEvent(turnCompleted(f.chatId)); // messageCount 20 ⇒ 20 % 4 == 0 fires; span (0, 4]

    // The pass ran ONE model call, and its task brief rode the prompt (the distill brief's whole job).
    expect(f.quietCalls).toHaveLength(1);
    expect(f.quietCalls[0]?.prompt).toContain("Your task: From the SETTLED stretch of play only, distill the durable facts");

    // Confirm-first: a CARD is raised carrying the RESOLVED entries; nothing durable moved yet.
    const pending = f.suggestions.listForChat(f.chatId, FIXED_NOW_MS)[0];
    expect(pending?.kind).toBe("confirm");
    expect(pending?.summary).toBe("Save a lore entry for “the-courier”?");
    expect(pending?.payload).toMatchObject({ via: "analysis", act: { kind: "lore", bookId, spanEnd: DISTILL_SPAN_END } });
    const act = pending?.payload?.via === "analysis" ? pending.payload.act : null;
    const entry = act?.kind === "lore" ? act.entries[0] : undefined;
    // Law 7 — the model's `{{setvar}}` is NEUTRALIZED (a ZWSP between each brace pair), never live.
    expect(entry?.content).toContain(`{${ZWSP}{setvar::x::1}${ZWSP}}`);
    expect(entry?.content).not.toContain("{{setvar");
    // Span-stamped key (`s<spanStart>.<key>`) — the idempotency handle a watermark-unmoved retry overwrites.
    expect(entry?.entryKey).toBe("s0.the-courier");
    // The high-water mark does NOT advance on a raise — a dismissed/expired card leaves the span uncovered.
    expect((await selectRuleState(f.db, ruleId)).state.settledThroughSeq).toBe(0);
  });

  test("IDEMPOTENT ON RE-RUN: confirm advances the watermark, and a re-fire over the now-covered span distills NOTHING (the watermark held)", async () => {
    const f = await setup();
    const bookId = await seedAttachedBook(f);
    const views = await mintAndEnable(f, "distillLore", { everyN: DISTILL_CADENCE, bookId });
    const ruleId = castId<AutomationRuleId>(nth(views, 0).id);
    await f.seedBeats(DISTILL_BEATS);
    f.setQuietReply(loreReply("the-courier"));

    // Fire 1 ⇒ the confirm card. The watermark is still 0 (a raise never advances it).
    await f.svc.handleEvent(turnCompleted(f.chatId));
    const card = f.suggestions.listForChat(f.chatId, FIXED_NOW_MS)[0];
    expect((await selectRuleState(f.db, ruleId)).state.settledThroughSeq).toBe(0);

    // Confirm ⇒ the entries land through the ONE lore belt AND the watermark advances to the span end (4).
    const confirmed = await f.svc.confirmSuggestion({ principal: principal(f.host), suggestionId: card?.id ?? mintTypeId(ID_PREFIX.automationSuggestion) });
    expect(confirmed).toMatchObject({ outcome: "fired" });
    expect((await selectRuleState(f.db, ruleId)).state.settledThroughSeq).toBe(DISTILL_SPAN_END);

    // WHY THE RE-RUN COVERS NOTHING — the mechanism this whole preset is built on: the settled read is
    // `through(= maxSeq − PROTECT_TAIL = 4) <= settledThroughSeq(= 4)`, so the span is empty, the lore route
    // drops for this pass, and the model can emit no lore to distill. The already-distilled span (0, 4] is
    // never re-read — that is idempotency, made mechanically true by the advance-on-success watermark. Had the
    // watermark NOT advanced (a bug), this re-fire would re-distill (0, 4] and re-raise an `s0.*` card.
    f.setQuietReply(loreReply("the-courier")); // the model would offer the same lore again — the watermark, not the model, is the guard
    await f.svc.handleEvent(turnCompleted(f.chatId)); // still 20 messages ⇒ 20 % 4 == 0 fires again

    expect(f.suggestions.countForChat(f.chatId)).toBe(0); // NO new card — nothing settled remained to distill
    expect((await selectRuleState(f.db, ruleId)).state.settledThroughSeq).toBe(DISTILL_SPAN_END); // and the mark held
  });

  test("the attach gate follows the ORIGIN: mint REFUSES a real-but-unattached target book (the room never consented)", async () => {
    const f = await setup();
    const bookId = mintTypeId(ID_PREFIX.worldBook);
    await f.db.insert(worldBooks).values({ id: bookId, ownerId: f.host, name: "detached lore" }); // exists, NOT attached
    await expect(
      f.svc.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, principal: principal(f.host), chatId: f.chatId, presetId: "distillLore", knobs: { bookId } }),
    ).rejects.toThrow(UNATTACHED_BOOK);
    expect(await f.svc.listRules({ principal: principal(f.host), chatId: f.chatId })).toEqual([]);
  });

  test("the attach gate is RE-CHECKED at confirm: a book detached between the card and the yes refuses on stale consent (zero writes)", async () => {
    const f = await setup();
    const bookId = await seedAttachedBook(f);
    const ruleId = castId<AutomationRuleId>(nth(await mintAndEnable(f, "distillLore", { everyN: DISTILL_CADENCE, bookId }), 0).id);
    await f.seedBeats(DISTILL_BEATS);
    f.setQuietReply(loreReply("the-courier"));
    await f.svc.handleEvent(turnCompleted(f.chatId));
    const card = f.suggestions.listForChat(f.chatId, FIXED_NOW_MS)[0];

    // The room withdraws consent after the card is raised — the belt answers for the state NOW, not at raise.
    await f.db.delete(chatBooks).where(and(eq(chatBooks.chatId, f.chatId), eq(chatBooks.worldBookId, bookId)));
    const result = await f.svc.confirmSuggestion({ principal: principal(f.host), suggestionId: card?.id ?? mintTypeId(ID_PREFIX.automationSuggestion) });

    // Errors-as-data at the verb, and nothing durable moved: no entry wrote, and the watermark never advanced
    // (the confirm's state write is downstream of the belt, so a refused belt leaves the span uncovered for a
    // later retry once the book is re-attached).
    expect(result).toMatchObject({ outcome: "action_error" });
    expect(await f.db.select().from(worldEntries)).toEqual([]);
    expect((await selectRuleState(f.db, ruleId)).state.settledThroughSeq).toBe(0);
  });

  test("REFUSES at mint without a book — the entityRef knob has no usable default and the refusal is typed", async () => {
    const f = await setup();
    await expect(
      f.svc.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, principal: principal(f.host), chatId: f.chatId, presetId: "distillLore", knobs: {} }),
    ).rejects.toThrow(NO_BOOK);
  });
});

describe("§4 #11 rumour mill (C2 — the same route, the consequences-and-hearsay brief)", () => {
  test("create → fire: the same confirm-first lore route runs, and its DISTINCT brief (rumours + consequences) rides the pass", async () => {
    const f = await setup();
    const bookId = await seedAttachedBook(f);
    const views = await mintAndEnable(f, "rumorMill", { everyN: DISTILL_CADENCE, bookId });
    // Same plumbing as distillLore — confirm-first lore route into the chosen book.
    expect(nth(views, 0).actions[0]).toMatchObject({ type: "run_analysis", routes: { lore: { apply: "confirm", bookId } } });

    await f.seedBeats(DISTILL_BEATS);
    f.setQuietReply(loreReply("the-rumour"));
    await f.svc.handleEvent(turnCompleted(f.chatId));

    // The rumour-mill brief — not the distiller's — reached the model (the ONE thing that differs).
    expect(f.quietCalls).toHaveLength(1);
    expect(f.quietCalls[0]?.prompt).toContain("distill the CONSEQUENCES and HEARSAY");
    // And it asks first, on the same card machinery.
    const pending = f.suggestions.listForChat(f.chatId, FIXED_NOW_MS)[0];
    expect(pending?.kind).toBe("confirm");
    expect(pending?.payload).toMatchObject({ via: "analysis", act: { kind: "lore", bookId, spanEnd: DISTILL_SPAN_END } });
  });
});
