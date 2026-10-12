// S3 — the committed §4 presets minted through the REAL `createRuleFromPreset` verb, enabled and FIRED through the real dispatch engine: the cadence, clock, veil, callback, cutaway and A4 confirm-first rows.
// @subject packages/server/src/domain/automation/verbs/create-rule-from-preset.ts

import { chatBooks, worldBooks, worldEntries } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { FIXED_NOW_MS, principal } from "../_support.ts";
import {
  MS_PER_HOUR,
  messageCommitted,
  mintAndEnable,
  NO_BOOK,
  nth,
  outcomes,
  setup,
  turnCompleted,
  UNATTACHED_BOOK,
} from "./_create-rule-from-preset-support.ts";

// ── per-preset create → fire receipts, through the real engine ────────────────────────────────────────

describe("§4 #4 periodic pacing nudge", () => {
  test("fires a guided turn on the cadence beat and stays silent off it", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "pacingNudge", { everyN: 4, steer: "Shift the pacing." });
    await f.seedBeats(4);

    await f.svc.handleEvent(turnCompleted(f.chatId)); // messageCount 4 ⇒ 4 % 4 == 0

    expect(f.turns).toHaveLength(1);
    expect(f.turns[0]).toMatchObject({ chatId: f.chatId, authorUserId: f.host, guided: "Shift the pacing.", automationDepth: 1 });
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);

    await f.seedBeats(1); // messageCount 5 ⇒ off the cadence
    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.turns).toHaveLength(1);
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired", "predicate_false"]);
  });
});

describe("§4 #5 auto-illustrate scene changes", () => {
  test("fires a non-quiet generate_image in the knob's mode", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "illustrateScenes", { everyN: 2, mode: "background" });
    await f.seedBeats(2);

    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.images).toHaveLength(1);
    expect(f.images[0]).toMatchObject({ chatId: f.chatId, authorUserId: f.host, mode: "background", n: 1, quiet: false, automationDepth: 1 });
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);
  });
});

describe("§4 #6 dice chips after a beat", () => {
  test("surfaces the chip deck on the automation bus, each chip its own send text (law 3)", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "diceChips", { everyN: 2, labels: ["I roll for it.", "I hold back."] });
    await f.seedBeats(2);

    await f.svc.handleEvent(turnCompleted(f.chatId));

    const surfaced = f.bus.filter((event) => event.type === "quickReplySurfaced");
    expect(surfaced).toHaveLength(1);
    expect(surfaced[0]).toMatchObject({
      type: "quickReplySurfaced",
      chatId: f.chatId,
      source: { kind: "rule", ruleId: nth(views, 0).id },
      choices: [
        { label: "I roll for it.", sendText: "I roll for it." },
        { label: "I hold back.", sendText: "I hold back." },
      ],
    });
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);
  });
});

describe("§4 #7 clock fires when full (two rules, ONE batch)", () => {
  test("the counter fills across batches, then the threshold fires AND resets IN THE SAME BATCH as the final tick", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "clockFires", { n: 2 });
    const [counter, threshold] = [nth(views, 0), nth(views, 1)];

    await f.svc.handleEvent(turnCompleted(f.chatId)); // tick 1
    expect(f.vars["clock"]).toBe("1");
    // B9: R1 publishes the threshold into the member-visible vars plane every beat — the flank widget's max.
    expect(f.vars["clockMax"]).toBe("2");
    expect(f.turns).toHaveLength(0);

    // Tick 2: R1 increments to 2 and writes THROUGH onto the shared cached env; R2 — same batch, same env —
    // reads 2, fires, and deletes the key. Without the write-through R2 would read the stale "1" and the clock
    // would fire a whole batch late, forever.
    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.turns).toHaveLength(1);
    expect(f.turns[0]?.guided).toContain("The pressure that has been building");
    expect(f.vars["clock"]).toBeUndefined(); // the reset arm ran
    expect(f.vars["clockMax"]).toBe("2"); // …but the threshold survives the reset — the widget's honest 0/N state
    expect(await outcomes(f, counter)).toEqual(["fired", "fired"]);
    expect(await outcomes(f, threshold)).toEqual(["fired"]); // the tick-1 miss logs nothing (pre-first-fire)

    await f.svc.handleEvent(turnCompleted(f.chatId)); // the clock refills from zero
    expect(f.vars["clock"]).toBe("1");
    expect(f.turns).toHaveLength(1);
  });

  test("the notify arm variant mints a post_notification rule that clears the cooldown floor", async () => {
    const f = await setup();
    const threshold = nth(await mintAndEnable(f, "clockFires", { n: 1, firedArm: "notify", firedText: "The clock ran out." }), 1);
    expect(threshold.cooldownSeconds).toBe(60);

    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.notices.filter((n) => n.type === "automation-notice")).toHaveLength(1);
    expect(f.notices[0]).toMatchObject({ type: "automation-notice", recipientUserId: f.host, message: "The clock ran out." });
    expect(f.vars["clock"]).toBeUndefined();
  });
});

describe("§4 #9 scene veil", () => {
  test("the veil marker in a member's own message redirects the next beat; a message without it does nothing", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "sceneVeil", { veilWord: "((veil))", redirect: "Cut away." });

    f.setMessageContent("she takes his hand ((veil))");
    await f.svc.handleEvent(messageCommitted(f.chatId));

    expect(f.turns).toHaveLength(1);
    expect(f.turns[0]?.guided).toBe("Cut away.");
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);

    f.setMessageContent("she takes his hand");
    await f.svc.handleEvent(messageCommitted(f.chatId));

    expect(f.turns).toHaveLength(1);
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired", "predicate_false"]);
  });
});

describe("§4 #12 the callback rule (two rules)", () => {
  test("a promise records a debt anchored to the beat; D beats later it resurfaces and both keys clear", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "callback", { distance: 2, steer: "The promise resurfaces." });
    const [mark, resurface] = [nth(views, 0), nth(views, 1)];

    // Beat 1 — the promise. R1 marks; R2 (same batch, write-through) sees distance 0 and holds.
    await f.seedBeats(1);
    f.setMessageContent("I PROMISE I will come back for you");
    await f.svc.handleEvent(messageCommitted(f.chatId));

    expect(f.vars).toMatchObject({ debt: "1", debtBeat: "1" }); // the {{expr::int(chat.messageCount)}} anchor
    expect(f.turns).toHaveLength(0);
    expect(await outcomes(f, mark)).toEqual(["fired"]);

    // Beat 3 — two beats later, on an unrelated message. R1 holds, R2 fires and clears.
    await f.seedBeats(2);
    f.setMessageContent("the road bends north");
    await f.svc.handleEvent(messageCommitted(f.chatId));

    expect(f.turns).toHaveLength(1);
    expect(f.turns[0]?.guided).toBe("The promise resurfaces.");
    expect(f.vars["debt"]).toBeUndefined();
    expect(f.vars["debtBeat"]).toBeUndefined();
    expect(await outcomes(f, resurface)).toEqual(["fired"]);

    // …and it does not re-fire on the next beat (the debt is gone).
    await f.seedBeats(1);
    await f.svc.handleEvent(messageCommitted(f.chatId));
    expect(f.turns).toHaveLength(1);
  });

  test("the case-insensitive needle matches regardless of the message's casing", async () => {
    const f = await setup();
    const mark = nth(await mintAndEnable(f, "callback", { patterns: ["on my honour"] }), 0);
    await f.seedBeats(1);

    f.setMessageContent("ON MY HONOUR, it will be done");
    await f.svc.handleEvent(messageCommitted(f.chatId));

    expect(f.vars["debt"]).toBe("1");
    expect(await outcomes(f, mark)).toEqual(["fired"]);
  });
});

describe("§4 #13 cutaways", () => {
  test("fires the cutaway steer on the cadence beat", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "cutaways", { everyN: 3, steer: "One short cutaway." });
    await f.seedBeats(3);

    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.turns).toHaveLength(1);
    expect(f.turns[0]?.guided).toBe("One short cutaway.");
    expect(await outcomes(f, nth(views, 0))).toEqual(["fired"]);
  });
});

// ── A4's four rows (§4 #1/#3/#8/#10) ─────────────────────────────────────────────────────────────────

describe("§4 #1 welcome-back recap (two rules, the confirm-first CARD)", () => {
  test("R1 stamps every beat; R2 ASKS on a stale open, and answers nothing on a fresh one", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "welcomeBackRecap", { idleHours: 1, steer: "Recap it." });

    // A beat stamps the clock (the injected FIXED clock, so the stamp is deterministic).
    await f.svc.handleEvent(messageCommitted(f.chatId));
    expect(f.vars["lastBeatMs"]).toBe(String(FIXED_NOW_MS));

    // Opening NOW is not idle — the recap rule's predicate is false and nothing is asked.
    await f.svc.handleEvent({ type: "chatOpened", chatId: f.chatId });
    expect(f.suggestions.countForChat(f.chatId)).toBe(0);

    // Rewind the stamp past the idle window: the SAME open now asks — and asks with a CARD, not a turn.
    f.vars["lastBeatMs"] = String(FIXED_NOW_MS - 2 * MS_PER_HOUR);
    await f.svc.handleEvent({ type: "chatOpened", chatId: f.chatId });

    expect(f.turns).toEqual([]);
    const [ask] = f.suggestions.listForChat(f.chatId, FIXED_NOW_MS);
    expect(ask).toMatchObject({ kind: "confirm", source: { kind: "rule", ruleId: nth(views, 1).id } });
    expect(ask?.summary).toBe("Take a turn: “Recap it.”");
  });
});

describe("§4 #3 auto-add lore entries (confirm-first BY DEFAULT)", () => {
  test("on its cadence it ASKS rather than writing; the ask names the entry", async () => {
    const f = await setup();
    const bookId = mintTypeId(ID_PREFIX.worldBook);
    await f.db.insert(worldBooks).values({ id: bookId, ownerId: f.host, name: "lore" });
    await f.db.insert(chatBooks).values({ chatId: f.chatId, worldBookId: bookId });

    await mintAndEnable(f, "autoAddLore", { bookId, everyN: 2, entryKey: "session notes" });
    await f.seedBeats(2);
    await f.svc.handleEvent(messageCommitted(f.chatId));

    const [ask] = f.suggestions.listForChat(f.chatId, FIXED_NOW_MS);
    expect(ask?.summary).toBe("Save a lore entry for “session notes”?");
    // Nothing was written — the whole point of the row (the natural first card).
    expect(await f.db.select().from(worldEntries)).toEqual([]);
  });

  test("REFUSES at mint without a book — the knob has no usable default and the refusal is typed", async () => {
    const f = await setup();
    await expect(
      f.svc.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, principal: principal(f.host), chatId: f.chatId, presetId: "autoAddLore", knobs: {} }),
    ).rejects.toThrow(NO_BOOK);
  });

  test("#630: a REAL book that is not attached to THIS chat still refuses at mint, one step later", async () => {
    // The picker offers only this chat's attached books, but attachment is a LIVE fact: a listed book can
    // stop qualifying between the form's render and the press. That refusal must stay reachable — it is
    // what `mintFailureToast` shows the host instead of a card that quietly did nothing.
    const f = await setup();
    const bookId = mintTypeId(ID_PREFIX.worldBook);
    await f.db.insert(worldBooks).values({ id: bookId, ownerId: f.host, name: "detached lore" });

    await expect(
      f.svc.createRuleFromPreset({ timeZone: UTC_TIME_ZONE, principal: principal(f.host), chatId: f.chatId, presetId: "autoAddLore", knobs: { bookId } }),
    ).rejects.toThrow(UNATTACHED_BOOK);
  });
});

describe("§4 #8 opener chips (the compose-mode staple deck)", () => {
  test("opening the room surfaces the deck in COMPOSE mode — seeds the member owns and edits", async () => {
    const f = await setup();
    await mintAndEnable(f, "openerChips", { labels: ["Continue.", "Time skip."] });

    await f.svc.handleEvent({ type: "chatOpened", chatId: f.chatId });

    const [surfaced] = f.bus.filter((e) => e.type === "quickReplySurfaced");
    expect(surfaced?.type === "quickReplySurfaced" ? surfaced.choices : []).toEqual([
      { label: "Continue.", sendText: "Continue.", mode: "compose" },
      { label: "Time skip.", sendText: "Time skip.", mode: "compose" },
    ]);
  });
});

describe("§4 #10 call a vote (send-mode chips, R7-invoked)", () => {
  test("it NEVER fires on its own, and the host's run-now surfaces the picks as the members' own lines", async () => {
    const f = await setup();
    const views = await mintAndEnable(f, "callAVote", { options: ["I say we press on.", "I abstain."] });

    // Every bus event of its trigger: nothing. That is the `false` predicate, working.
    await f.svc.handleEvent({ type: "chatOpened", chatId: f.chatId });
    expect(f.bus.filter((e) => e.type === "quickReplySurfaced")).toEqual([]);

    const result = await f.svc.runRuleNow({ principal: principal(f.host), ruleId: nth(views, 0).id });

    expect(result).toEqual({ outcome: "fired" });
    const [surfaced] = f.bus.filter((e) => e.type === "quickReplySurfaced");
    expect(surfaced?.type === "quickReplySurfaced" ? surfaced.choices : []).toEqual([
      { label: "I say we press on.", sendText: "I say we press on.", mode: "send" },
      { label: "I abstain.", sendText: "I abstain.", mode: "send" },
    ]);
  });
});
