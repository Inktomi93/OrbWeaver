// S3 — the prose audit (C3), the async table nudge and spotlight balance (C6), and the three optional owner picks, minted and FIRED through the real verb and engine.
// @subject packages/server/src/domain/automation/verbs/create-rule-from-preset.ts

import type { AutomationAction } from "@orb/contracts/automation";
import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import { rpgGames } from "@orb/db";
import type { AutomationRuleId, AutomationSuggestionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { sha256Hex } from "#server/primitives/content-hash/index.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { FIXED_NOW_MS, principal, seedUser } from "../_support.ts";
import type { ApplyProseRewrite, Fixture } from "./_create-rule-from-preset-support.ts";
import {
  armBackdrop,
  MS_PER_HOUR,
  messageCommitted,
  mintAndEnable,
  nth,
  outcomes,
  selectRuleState,
  setup,
  turnCompleted,
  worldInfoActivated,
} from "./_create-rule-from-preset-support.ts";

// ── §4 #15 C3's prose audit ───────────────────────────────────────────────────────────────────────────
// The confirm-first rewrite card, end to end through the REAL engine: mint → R7 run → card (variant-pinned +
// content-hashed) → confirm (the op receives the pins) — plus the clean verdict, which is the whole reason
// the on-demand arm is the default (a `fired` outcome with zero cards is "it ran and found nothing", legibly
// different from `predicate_false`'s "it never ran").

/** A canned audit reply. `clean` is the common verdict; `flawed` carries the full corrected reply. */
function auditReply(verdict: "clean" | "flawed", text = ""): string {
  return JSON.stringify({
    arcStatus: "active",
    updatedArc: null,
    successorArc: null,
    twistOps: [],
    rewrite: { verdict, issue: verdict === "flawed" ? "repeats itself" : "", text },
  });
}

describe("§4 #15 prose audit (C3 — confirm-first, variant-pinned + hash-guarded)", () => {
  test("the stored arm is the audit shape: a rewrite-route analysis that never fires on its own at the default knob", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "proseAudit");

    expect(nth(views, 0).name).toBe("Prose audit");
    const stored: readonly AutomationAction[] = nth(views, 0).actions;
    expect(stored[0]).toMatchObject({ type: "run_analysis", routes: { rewrite: {} } });
    // NO other route: the audit may not steer, write lore, or publish a var (the brief's own fence).
    expect(stored[0]?.type === "run_analysis" ? Object.keys(stored[0].routes) : []).toEqual(["rewrite"]);
    // Law 5's conservative default, spelled as CEL: `false` never fires by itself, so an enabled audit costs
    // nothing until the host presses Run now.
    expect(nth(views, 0).predicateCel).toBe("false");
  });

  test("R7 on a FLAWED reply raises ONE card pinned to the audited variant + hashed over its bytes, and reports `suggested`", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "proseAudit");
    await f.seedBeats(3); // seq 3 is the newest assistant reply — `body-3`
    f.setQuietReply(auditReply("flawed", "Said once, cleanly."));

    const { outcome } = await f.svc.runRuleNow({ principal: await principal(f.db, f.host), ruleId: castId<AutomationRuleId>(nth(views, 0).id) });

    expect(outcome).toBe("suggested");
    const pending = f.suggestions.listForChat(f.chatId, FIXED_NOW_MS)[0];
    expect(pending?.kind).toBe("confirm");
    expect(pending?.summary).toBe("Fix the last reply — repeats itself?");
    expect(pending?.payload).toMatchObject({
      via: "analysis",
      act: { kind: "rewrite", contentHash: sha256Hex("body-3"), content: "Said once, cleanly." },
    });
    // The card's own body — the host reads the change, not just the question (the `@orb/ui/diff` payload).
    const raised = f.bus.find((e) => e.type === "suggestionRaised");
    expect(raised).toMatchObject({ detail: { kind: "rewrite", before: "body-3", after: "Said once, cleanly." } });
  });

  test("R7 on a CLEAN reply returns the clean verdict SYNCHRONOUSLY and draws nothing", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "proseAudit");
    await f.seedBeats(3);
    f.setQuietReply(auditReply("clean"));

    const { outcome } = await f.svc.runRuleNow({ principal: await principal(f.db, f.host), ruleId: castId<AutomationRuleId>(nth(views, 0).id) });

    // `fired` — it RAN. That is the legacy transient-clean lesson carried without a new terminal: a host who
    // pressed Run now learns "checked, nothing wrong" rather than getting silence they cannot tell from a
    // rule that never fired.
    expect(outcome).toBe("fired");
    expect(f.suggestions.listForChat(f.chatId, FIXED_NOW_MS)).toEqual([]);
    expect(f.bus.filter((e) => e.type === "suggestionRaised")).toEqual([]);
  });

  test("confirm hands the CARD's pins to the rewrite op unchanged, in the AUTHOR frame, and records a fired row", async () => {
    const rewrites: Parameters<ApplyProseRewrite>[0][] = [];
    const f = await setup({
      applyProseRewrite: (req): Promise<void> => {
        rewrites.push(req);
        return Promise.resolve();
      },
    });
    const views = await mintAndEnable(f, "proseAudit");
    await f.seedBeats(3);
    f.setQuietReply(auditReply("flawed", "Said once, cleanly."));
    await f.svc.runRuleNow({ principal: await principal(f.db, f.host), ruleId: castId<AutomationRuleId>(nth(views, 0).id) });
    const raisedId = f.suggestions.listForChat(f.chatId, FIXED_NOW_MS)[0]?.id;
    expect(raisedId).toBeDefined();

    const result = await f.svc.confirmSuggestion({ principal: await principal(f.db, f.host), suggestionId: castId<AutomationSuggestionId>(String(raisedId)) });

    expect(result).toEqual({ ran: "stashed-arm", outcome: "fired" });
    expect(rewrites).toEqual([
      {
        authorUserId: f.host, // the AUTHOR, never the confirmer (§3-S4's identity law)
        chatId: f.chatId,
        messageId: `message_${f.chatId}_3`,
        variantId: `variant_${f.chatId}_3_0`,
        expectedContentHash: sha256Hex("body-3"),
        content: "Said once, cleanly.",
      },
    ]);
    // TAKE-ONCE: the ask is spent, so a double-click finds nothing rather than rewriting twice.
    expect(f.suggestions.listForChat(f.chatId, FIXED_NOW_MS)).toEqual([]);
  });

  test("the every-reply knob mints the beat predicate WITH law 4's explicit cap — an uncapped per-reply audit would freeze stale", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "proseAudit", { when: "everyReply" });
    expect(nth(views, 0).predicateCel).toBe("!has(event.turn) || int(event.turn.automationDepth) == 0");
    expect(nth(views, 0).maxFiresPerHour).toBe(240);
  });
});

// ── §4 #2 the async table nudge (C6 — the actor-excluding recipient's consumer) ────────────────────────
// The row's owner test is "in a two-human room, only the WAITING member is pinged", which is why every case
// here seeds a second present human: with one member the preset is indistinguishable from `all_members`.

/** The fixture's chat gains a second PRESENT human member — the other seat at the async table. */
async function seedSecondMember(f: Fixture, id: string): Promise<UserId> {
  const member = await seedUser(f.db, id);
  await seedParticipant(f.db, { chatId: f.chatId, key: `auto_${id}`, userId: member, role: "member" });
  return member;
}

/** The nudge's idle stamp — the same `vars` key the preset's own stamp rule writes. Setting it to a time N
 *  hours back is how a test declares "the table has been quiet that long". */
const NUDGE_BEAT_KEY = "nudgeBeatMs";
/** Quiet hours OFF — equal bounds. The fixture's fixed clock sits at 22:00 UTC, and a test about idleness
 *  should not be silently deciding a second thing. */
const NO_QUIET_HOURS = { quietFromHour: 0, quietUntilHour: 0 };
/** The fixed clock's own UTC hour (`FIXED_NOW_MS` = 2023-11-14T22:13:20Z) — used to build a window that
 *  provably CONTAINS it. */
const FIXED_NOW_UTC_HOUR = 22;

describe("§4 #2 async table nudge", () => {
  test("create → fire: after a lull, the WAITING member is notified and the one who posted is not", async () => {
    const f = await setup();
    const waiting = await seedSecondMember(f, "user_waiting");
    const views = await mintAndEnable(f, "asyncTableNudge", { idleHours: 1, message: "Your move.", ...NO_QUIET_HOURS });
    expect(views.map((v) => v.name)).toEqual(["Async table nudge (1/2)", "Async table nudge (2/2)"]);

    // The table has been quiet for two hours; then the HOST posts (the harness's fact author).
    f.vars[NUDGE_BEAT_KEY] = String(FIXED_NOW_MS - 2 * MS_PER_HOUR);
    await f.svc.handleEvent(messageCommitted(f.chatId));

    // Exactly ONE notice, to the member who was waiting — the actor is spared.
    expect(f.notices).toEqual([
      { type: "automation-notice", recipientUserId: waiting, chatId: f.chatId, source: { kind: "rule", ruleId: nth(views, 0).id }, message: "Your move." },
    ]);
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);

    // THE ORDER PROOF, and it is only visible here: the stamp rule ran in the SAME batch and refreshed the
    // beat time to now — yet the notice still went out, which can only be true if the nudge's predicate read
    // the stamp BEFORE the stamp arm overwrote it. Minted the other way round, the gap would read zero.
    expect(f.vars[NUDGE_BEAT_KEY]).toBe(String(FIXED_NOW_MS));
    expect(await outcomes(f, nth(views, 1))).toEqual(["fired"]);
  });

  test("mid-conversation it stays silent — a fresh beat is not a lull", async () => {
    const f = await setup();
    await seedSecondMember(f, "user_waiting");
    const views = await mintAndEnable(f, "asyncTableNudge", { idleHours: 1, ...NO_QUIET_HOURS });

    f.vars[NUDGE_BEAT_KEY] = String(FIXED_NOW_MS - 60_000); // a minute ago
    await f.svc.handleEvent(messageCommitted(f.chatId));

    // No notice, and the discriminator is the room's shape: with a second present human, a TRUE predicate
    // would have notified them (the actor-excluding set is non-empty here). Silence is the predicate.
    expect(f.notices).toEqual([]);
    // The fire log is empty rather than carrying `predicate_false` — the engine logs that outcome only after
    // a rule's FIRST fire (the lean first-match debug posture, `engine/dispatch.ts`), which this rule has not
    // had. Asserted so the absence reads as the engine's rule and not as a missing receipt.
    expect(await outcomes(f, nth(views, 0))).toEqual([]);
  });

  test("quiet hours mute it — an IDLE table stays silent inside the window", async () => {
    const f = await setup();
    await seedSecondMember(f, "user_waiting");
    // A window that provably contains the fixed clock's hour, built from the knobs a host would set.
    const views = await mintAndEnable(f, "asyncTableNudge", {
      idleHours: 1,
      quietFromHour: FIXED_NOW_UTC_HOUR,
      quietUntilHour: FIXED_NOW_UTC_HOUR + 1,
    });

    // The SAME idle gap that fired in the first case — so the only thing deciding this outcome is the hour.
    f.vars[NUDGE_BEAT_KEY] = String(FIXED_NOW_MS - 2 * MS_PER_HOUR);
    await f.svc.handleEvent(messageCommitted(f.chatId));

    expect(f.notices).toEqual([]);
    expect(await outcomes(f, nth(views, 0))).toEqual([]); // never fired ⇒ no `predicate_false` row (lean log)
    // The STAMP half is unaffected — quiet hours mute the notice, not the room's own bookkeeping.
    expect(f.vars[NUDGE_BEAT_KEY]).toBe(String(FIXED_NOW_MS));
  });
});

// ── §4 #14 spotlight balance (C6 — a C1 run_analysis row, direct steer) ───────────────────────────────

describe("§4 #14 spotlight balance", () => {
  test("create → fire: the cadence beat runs ONE quiet pass and its narrator-only guidance lands verbatim", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "spotlightBalance", { everyN: 2 });
    expect(nth(views, 0).name).toBe("Spotlight balance"); // single rule ⇒ bare title
    expect(nth(views, 0).actions[0]).toMatchObject({ type: "run_analysis", routes: { steer: { apply: "direct" } } });

    await f.seedBeats(2);
    f.setQuietReply(
      JSON.stringify({
        arcStatus: "active",
        updatedArc: "the quiet one has a debt",
        successorArc: null,
        twistOps: [],
        guidance: "Turn the scene toward the one who has not spoken: put the next question where only they can answer it.",
      }),
    );
    await f.svc.handleEvent(turnCompleted(f.chatId)); // messageCount 2 ⇒ 2 % 2 == 0

    expect(f.quietCalls).toHaveLength(1);
    // The spotlight brief — not the pacing one — rode the pass.
    expect(f.quietCalls[0]?.prompt).toContain("Your task: Watch how the spotlight has been moving");
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);
    const stored = await selectRuleState(f.db, castId<AutomationRuleId>(nth(views, 0).id));
    expect(stored.guidance).toBe("Turn the scene toward the one who has not spoken: put the next question where only they can answer it.");

    // Off the cadence: silent, and no model call is spent (this row is SPEND-classed).
    await f.seedBeats(1);
    await f.svc.handleEvent(turnCompleted(f.chatId));
    expect(f.quietCalls).toHaveLength(1);
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired", "predicate_false"]);
  });

  test("mint REFUSES on an active-game chat — it inherits the analysis arm's own admission row (D109)", async () => {
    const f = await setup();
    await f.db.insert(rpgGames).values({
      id: mintTypeId(ID_PREFIX.rpgGame),
      chatId: f.chatId,
      mode: "lite",
      status: "active",
      config: rpgGameConfigSchema.parse({}),
    });
    await expect(
      f.svc.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, principal: await principal(f.db, f.host), chatId: f.chatId, presetId: "spotlightBalance" }),
    ).rejects.toThrow("directs its own story");
  });
});

// ── §4 #17-#19 the three OPTIONAL owner-picks (owner 2026-08-24 "everything optional gets included") ──────

describe("§4 #17 illustrate on lore reveal", () => {
  test("the entry filter gates on COUNT: a small reveal draws nothing, a reveal at the floor fires one scenario image", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "illustrateOnLoreReveal", { minEntries: 2 });
    expect(nth(views, 0).trigger).toEqual({ bus: "chat", type: "worldInfoActivated" });

    // One entry is below the floor of 2 — the predicate is false, and a rule that has never fired logs nothing.
    await f.svc.handleEvent(worldInfoActivated(f.chatId, 1));
    expect(f.images).toHaveLength(0);
    expect(await outcomes(f, nth(views, 0))).toEqual([]);

    // Two entries meet the floor — a non-quiet scenario image is posted into the room at automation depth 1.
    await f.svc.handleEvent(worldInfoActivated(f.chatId, 2));
    expect(f.images).toHaveLength(1);
    expect(f.images[0]).toMatchObject({ chatId: f.chatId, authorUserId: f.host, mode: "scenario", n: 1, quiet: false, automationDepth: 1 });
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);
  });
});

describe("§4 #18 react to lore activation", () => {
  test("a lore reveal steers a guided turn, and the cooldown belt refuses the immediate re-fire (the cooldown self-chain belt)", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "reactToLoreActivation", { steer: "Have a character notice it." });
    // The cooldown is a COMPLEMENTARY belt to the engine's cascade-depth cap (the cap now bounds a reaction
    // turn's own re-activation — `worldInfoActivated` carries the generating turn's depth; #704). This case
    // feeds two human-plane reveals (depth 0) at the SAME fixed instant, isolating the wall-clock cooldown:
    // the second lands inside the 180s window and is refused before any depth check.
    expect(nth(views, 0).cooldownSeconds).toBe(180);

    await f.svc.handleEvent(worldInfoActivated(f.chatId, 1));
    expect(f.turns).toHaveLength(1);
    expect(f.turns[0]?.guided).toBe("Have a character notice it.");

    // The clock is fixed, so a second reveal lands inside the cooldown window and is refused — the same gate
    // that breaks the production self-chain, proven here.
    await f.svc.handleEvent(worldInfoActivated(f.chatId, 1));
    expect(f.turns).toHaveLength(1);
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired", "budget_refused"]);
  });
});

describe("§4 #19 auto-set scene background", () => {
  test("a committed message re-dresses the backdrop over the author's own library; the cooldown spaces the re-pick", async () => {
    const f = await setup();
    const background = armBackdrop(f);
    const views = await mintAndEnable(f, "autoSetSceneBackground", { instruction: "Match where the scene is now." });
    expect(nth(views, 0).trigger).toEqual({ bus: "chat", type: "messageCommitted" });
    expect(nth(views, 0).cooldownSeconds).toBe(300);

    f.setMessageContent("They step out of the storm and into the harbour tavern.");
    await f.svc.handleEvent(messageCommitted(f.chatId));

    // The quiet autobg pick ran and the chosen background was written — the row re-dressed itself, no post, no
    // spend (set_chat_background is not SPEND_ARM_TYPES).
    expect(f.quietCalls.map((c) => c.posture)).toEqual(["autobg"]);
    expect(f.backgroundsSet).toEqual([background]);
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);

    // A second message inside the cooldown window does not re-pick — the backdrop holds and no second quiet call.
    await f.svc.handleEvent(messageCommitted(f.chatId));
    expect(f.backgroundsSet).toEqual([background]);
    expect(f.quietCalls.map((c) => c.posture)).toEqual(["autobg"]);
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired", "budget_refused"]);
  });
});
