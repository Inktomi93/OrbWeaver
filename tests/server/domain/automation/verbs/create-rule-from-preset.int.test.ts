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

import type { AutomationAction, AutomationBusEvent, TriggerFact } from "@orb/contracts/automation";
import { RULE_PRESET_IDS } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { NotificationEvent } from "@orb/contracts/notifications";
import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import type { ThemeBackground } from "@orb/contracts/theme";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { chatBooks, rpgGames, worldBooks, worldEntries } from "@orb/db";
import type { AutomationRuleId, ChatId, MessageId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { ZWSP } from "@orb/kit/macro";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import type {
  ArmDispatch,
  AutomationImageRequest,
  AutomationOps,
  AutomationTurnRequest,
  BackgroundChoice,
  SuggestionStore,
} from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import type { RuleView } from "../../../../../packages/server/src/domain/automation/contract/results.ts";
import type { AutomationService } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/index.ts";
import { selectRuleState } from "../../../../../packages/server/src/domain/automation/persistence/rule-state.ts";
import { createSuggestionStore } from "../../../../../packages/server/src/domain/automation/substrate/suggestions.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedMessage } from "../../chat/_support.ts";
import { FIXED_NOW_MS, makeAutomationHarness, NO_TOOLS, principal, seedHostChat, seedUser } from "../_support.ts";

/** The typed refusals these suites assert (hoisted — `useTopLevelRegex`). */
const BAD_KNOB = /knob 'everyN'/;
/** An UNCHOSEN book now refuses at the KNOB, in the host's own noun (#630 — the `entityRef` kind carries no
 *  default, so there is no `""` to fall through the arm schema's "Suffix should have 26 characters"). A
 *  real-but-unattached id still refuses one step later at `createRule`'s attachment check — that one is a
 *  LIVE fact no picker can pre-empt. Either way: typed, at mint, never stored. */
const NO_BOOK = /knob 'bookId': choose a lorebook/u;
/** The LIVE half of the same guard — `substrate/validate.ts`'s attachment probe, one step after the knob. */
const UNATTACHED_BOOK = /is not attached to this chat/u;

/** #1's idle window is expressed in epoch-ms; the preset substitutes hours × this. */
const MS_PER_HOUR = 3_600_000;

interface Fixture {
  readonly db: Db;
  readonly host: UserId;
  readonly chatId: ChatId;
  readonly svc: AutomationService;
  /** The LIVE chat variable store the arms fold into and the CEL env reads back. */
  readonly vars: Record<string, string>;
  readonly turns: AutomationTurnRequest[];
  readonly images: AutomationImageRequest[];
  readonly notices: NotificationEvent[];
  readonly bus: AutomationBusEvent[];
  /** S4 — the pending asks a confirm-first preset's fire raised. */
  readonly suggestions: SuggestionStore;
  /** The message projection `getMessageFact` serves for the next `messageCommitted` event. */
  readonly setMessageContent: (content: string) => void;
  /** The canned `summarizeQuiet` reply (#15's analysis pass) — "" until a test sets one. */
  readonly setQuietReply: (text: string) => void;
  /** #16 — the author's owned background library the `set_chat_background` quiet pick chooses among. EMPTY
   *  by default (the arm soft-no-ops with nothing to pick), so only the needle's suite pays for it. */
  readonly setBackgroundChoices: (choices: readonly BackgroundChoice[]) => void;
  /** Every background the arm actually WROTE, in order — the receipt that the room re-dressed itself. */
  readonly backgroundsSet: ThemeBackground[];
  /** The canned `autobg`-posture reply — the background NAME the quiet pick returns (#16's backdrop half). */
  readonly setAutobgReply: (text: string) => void;
  /** Every prompt the quiet op received (system + user + posture), in call order. */
  readonly quietCalls: { systemPrompt: string; prompt: string; posture: string }[];
  readonly seedBeats: (count: number) => Promise<void>;
}

async function setup(): Promise<Fixture> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host);
  const vars: Record<string, string> = {};
  const turns: AutomationTurnRequest[] = [];
  const images: AutomationImageRequest[] = [];
  const notices: NotificationEvent[] = [];
  const bus: AutomationBusEvent[] = [];
  const quietCalls: { systemPrompt: string; prompt: string; posture: string }[] = [];
  const backgroundsSet: ThemeBackground[] = [];
  let messageContent = "";
  let quietReply = "";
  let autobgReply = "";
  let backgroundChoices: readonly BackgroundChoice[] = [];
  let seeded = 0;

  const ops: AutomationOps = {
    tools: NO_TOOLS,
    chat: {
      getMessageFact: (): Promise<NonNullable<TriggerFact["message"]> | null> =>
        Promise.resolve({ id: "message_probe", role: "user", authorUserId: host, characterId: null, seq: 1, content: messageContent }),
      // No committed reply slot behind these synthetic events ⇒ depth 0 (the human plane).
      getTurnOrigin: () => Promise.resolve(null),
      resolveViewerVisibility: () => Promise.resolve(null),
      readVariables: () => Promise.resolve({ ...vars }),
      readChoicePicks: () => Promise.resolve({}),
      resolveChatProse: () => Promise.resolve({}),
      applyVariableOps: (_chatId, varOps) => {
        for (const op of varOps) {
          if (op.op === "delete") {
            delete vars[op.key];
          } else if (op.op === "set") {
            vars[op.key] = op.value;
          }
        }
        return Promise.resolve();
      },
      listBackgroundChoices: () => Promise.resolve(backgroundChoices),
      setChatBackground: ({ background }) => {
        backgroundsSet.push(background);
        return Promise.resolve();
      },
      requestTurn: (req) => {
        turns.push(req);
        return Promise.resolve({ costUsd: null, messageCount: 1 });
      },
    },
    worldInfo: { upsertEntries: () => Promise.resolve({ inserted: 0, updated: 0, skippedHandEdited: 0 }) },
    notifications: {
      emit: (event) => {
        notices.push(event);
        return Promise.resolve();
      },
    },
    imagery: {
      generatePicture: (req) => {
        images.push(req);
        return Promise.resolve({ costUsd: null, imageCount: 1 });
      },
    },
    // ONE quiet op, TWO postures — and the needle is the preset that fires both in a single batch (its
    // analysis pass, then its backdrop's autobg pick), so the canned reply is chosen by POSTURE. A single
    // canned string would have fed the analysis JSON to the background matcher, which soft-no-ops on an
    // off-list pick — a green test with the backdrop half silently never running.
    summarizeQuiet: ({ systemPrompt, prompt, posture }) => {
      quietCalls.push({ systemPrompt, prompt, posture });
      return Promise.resolve({ text: posture === "autobg" ? autobgReply : quietReply, costUsd: null });
    },
  };
  const notify = (event: AutomationBusEvent): void => void bus.push(event);
  // ONE store for the arm dispatcher AND the verbs (the compose posture): a confirm-first preset's fire
  // stashes through the dispatcher and is answered through the service, so two stores would make every
  // A4 row in this suite assert against an empty map.
  const suggestions = createSuggestionStore();
  const runArm: ArmDispatch = createArmExecutors({
    db,
    ops,
    prng: () => 0.42,
    notify,
    suggestions,
    newSuggestionId: () => mintTypeId(ID_PREFIX.automationSuggestion),
  });
  const svc = createAutomationService(makeAutomationHarness(db, { runArm, ops, notify, suggestions }));

  return {
    db,
    host,
    chatId,
    svc,
    vars,
    turns,
    images,
    notices,
    bus,
    suggestions,
    setMessageContent: (content: string): void => {
      messageContent = content;
    },
    setQuietReply: (text: string): void => {
      quietReply = text;
    },
    setAutobgReply: (text: string): void => {
      autobgReply = text;
    },
    setBackgroundChoices: (choices: readonly BackgroundChoice[]): void => {
      backgroundChoices = choices;
    },
    backgroundsSet,
    quietCalls,
    seedBeats: async (count: number): Promise<void> => {
      // Recursive, not a loop (the `noAwaitInLoops` discipline the sibling suites follow).
      const step = async (remaining: number): Promise<void> => {
        if (remaining <= 0) {
          return;
        }
        seeded += 1;
        await seedMessage(db, chatId, seeded);
        await step(remaining - 1);
      };
      await step(count);
    },
  };
}

/** The minted rule at `index` — a hard failure rather than a non-null assertion (the house lint bans `!`). */
function nth(views: readonly RuleView[], index: number): RuleView {
  const view = views[index];
  if (view === undefined) {
    throw new Error(`expected a minted rule at index ${index}, got ${views.length}`);
  }
  return view;
}

/** Mint a preset and ENABLE every rule it created. Returns the minted views in mint order. */
async function mintAndEnable(f: Fixture, presetId: Parameters<AutomationService["createRuleFromPreset"]>[0]["presetId"], knobs = {}): Promise<RuleView[]> {
  const p = principal(f.host);
  const views = await f.svc.createRuleFromPreset({ principal: p, chatId: f.chatId, presetId, knobs });
  const enable = async (index: number): Promise<void> => {
    const view = views[index];
    if (view === undefined) {
      return;
    }
    await f.svc.setRuleEnabled({ principal: p, ruleId: view.id, enabled: true });
    await enable(index + 1);
  };
  await enable(0);
  return views;
}

function turnCompleted(chatId: ChatId): ChatBusEvent {
  return { type: "turnCompleted", chatId, intent: "send", messageId: mintTypeId(ID_PREFIX.message) };
}

function messageCommitted(chatId: ChatId): ChatBusEvent {
  return { type: "messageCommitted", chatId, messageId: mintTypeId(ID_PREFIX.message) as MessageId };
}

/** Every outcome the rule logged, oldest first. */
async function outcomes(f: Fixture, view: RuleView): Promise<string[]> {
  const fires = await f.svc.listFires({ principal: principal(f.host), ruleId: view.id });
  return fires.map((fire) => fire.outcome).reverse();
}

// ── the mint's own contract ──────────────────────────────────────────────────────────────────────────

describe("createRuleFromPreset — the mint", () => {
  test("mints a single-rule preset under its bare title, born DISABLED, with the knobs substituted", async () => {
    const f = await setup();
    const [view] = await f.svc.createRuleFromPreset({
      principal: principal(f.host),
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
    const views = await f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "clockFires" });

    expect(views.map((v) => v.name)).toEqual(["Clock fires when full (1/2)", "Clock fires when full (2/2)"]);
    // Position order IS the same-batch mechanism: the counter must dispatch before the threshold.
    expect(nth(views, 0).position).toBeLessThan(nth(views, 1).position);
    expect(views[0]?.actions[0]).toMatchObject({ type: "set_variable", key: "clock", op: "inc" });
    // Law 4 — the counter half carries the explicit high cap; the threshold half keeps the default.
    expect(views[0]?.maxFiresPerHour).toBe(240);
    expect(views[1]?.maxFiresPerHour).toBe(30);
  });

  test("refuses a bad knob with a typed validation error and stores NOTHING", async () => {
    const f = await setup();
    await expect(
      f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "pacingNudge", knobs: { everyN: 5000 } }),
    ).rejects.toThrow(BAD_KNOB);
    expect(await f.svc.listRules({ principal: principal(f.host), chatId: f.chatId })).toEqual([]);
  });

  test("is HOST-gated through the same guard as createRule — a non-member never learns the chat exists", async () => {
    const f = await setup();
    const stranger = await seedUser(f.db, "user_stranger");
    await expect(f.svc.createRuleFromPreset({ principal: principal(stranger), chatId: f.chatId, presetId: "cutaways" })).rejects.toThrow();
    expect(await f.svc.listRules({ principal: principal(f.host), chatId: f.chatId })).toEqual([]);
  });
});

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
    expect(f.turns).toHaveLength(0);

    // Tick 2: R1 increments to 2 and writes THROUGH onto the shared cached env; R2 — same batch, same env —
    // reads 2, fires, and deletes the key. Without the write-through R2 would read the stale "1" and the clock
    // would fire a whole batch late, forever.
    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.turns).toHaveLength(1);
    expect(f.turns[0]?.guided).toContain("The pressure that has been building");
    expect(f.vars["clock"]).toBeUndefined(); // the reset arm ran
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
    await expect(f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "autoAddLore", knobs: {} })).rejects.toThrow(NO_BOOK);
  });

  test("#630: a REAL book that is not attached to THIS chat still refuses at mint, one step later", async () => {
    // The picker offers only this chat's attached books, but attachment is a LIVE fact: a listed book can
    // stop qualifying between the form's render and the press. That refusal must stay reachable — it is
    // what `mintFailureToast` shows the host instead of a card that quietly did nothing.
    const f = await setup();
    const bookId = mintTypeId(ID_PREFIX.worldBook);
    await f.db.insert(worldBooks).values({ id: bookId, ownerId: f.host, name: "detached lore" });

    await expect(f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "autoAddLore", knobs: { bookId } })).rejects.toThrow(
      UNATTACHED_BOOK,
    );
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

// ── the picker read model, over the same registry the mint uses ───────────────────────────────────────

test("listRulePresets projects every committed preset in catalogue order and carries no CEL", async () => {
  const f = await setup();
  const views = f.svc.listRulePresets();

  expect(views.map((v) => v.id)).toEqual([...RULE_PRESET_IDS]);
  // Each declared ruleCount is the count the MINT actually produces — the picker's "(i/n)" promise.
  const clock = await f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "clockFires" });
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
    await expect(f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "storyPacing" })).rejects.toThrow(
      "directs its own story",
    );
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
    await expect(f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "distillLore", knobs: { bookId } })).rejects.toThrow(
      UNATTACHED_BOOK,
    );
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
    await expect(f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "distillLore", knobs: {} })).rejects.toThrow(NO_BOOK);
  });
});

// ── §4 #16 the needle (RULED 2026-08-24 — ships, OFF by default) ──────────────────────────────────────
// The ONE preset that publishes a model-authored value into the MEMBER-VISIBLE chat-vars plane, which is why
// its receipts are as much about what does NOT cross as about what does. The wall is F6's single ruled
// exception: a clamped NUMERIC score may cross; arcs, twists and guidance never do.

/** #16's cadence + threshold, chosen so ONE seeded batch drives both rules: 8 beats ⇒ 8 % 4 == 0. */
const NEEDLE_BEATS = 8;
const NEEDLE_CADENCE = 4;
const NEEDLE_THRESHOLD = 6;
/** The author's one owned background, and the name the quiet pick returns to select it. */
const STORM_BACKDROP = "storm over the harbour";

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

/** Seed the author's background library and the pick that matches it. */
function armBackdrop(f: Fixture): ThemeBackground {
  const background = themeBackgroundSchema.parse({ kind: "seeded", seededId: "storm" });
  f.setBackgroundChoices([{ name: STORM_BACKDROP, background }]);
  f.setAutobgReply(STORM_BACKDROP);
  return background;
}

describe("§4 #16 the needle (the score → meter + backdrop pair)", () => {
  test("the stored set is the needle shape: a vars-ONLY analysis read, then the threshold backdrop rule — born disabled", async () => {
    const f = await setup();
    const views = await f.svc.createRuleFromPreset({
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
    await expect(f.svc.createRuleFromPreset({ principal: principal(f.host), chatId: f.chatId, presetId: "theNeedle" })).rejects.toThrow(
      "directs its own story",
    );
    expect(await f.svc.listRules({ principal: principal(f.host), chatId: f.chatId })).toEqual([]);
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
