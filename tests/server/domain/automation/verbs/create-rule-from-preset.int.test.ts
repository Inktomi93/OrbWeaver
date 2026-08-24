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
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import type { ChatId, MessageId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import type {
  ArmDispatch,
  AutomationImageRequest,
  AutomationOps,
  AutomationTurnRequest,
} from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import type { RuleView } from "../../../../../packages/server/src/domain/automation/contract/results.ts";
import type { AutomationService } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedMessage } from "../../chat/_support.ts";
import { makeAutomationHarness, principal, seedHostChat, seedUser } from "../_support.ts";

/** The typed refusal a bad knob raises (hoisted — `useTopLevelRegex`). */
const BAD_KNOB = /knob 'everyN'/;

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
  /** The message projection `getMessageFact` serves for the next `messageCommitted` event. */
  readonly setMessageContent: (content: string) => void;
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
  let messageContent = "";
  let seeded = 0;

  const ops: AutomationOps = {
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
      listBackgroundChoices: () => Promise.resolve([]),
      setChatBackground: () => Promise.resolve(),
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
    summarizeQuiet: () => Promise.resolve({ text: "", costUsd: null }),
  };
  const notify = (event: AutomationBusEvent): void => void bus.push(event);
  const runArm: ArmDispatch = createArmExecutors({ db, ops, prng: () => 0.42, notify });
  const svc = createAutomationService(makeAutomationHarness(db, { runArm, ops, notify }));

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
    setMessageContent: (content: string): void => {
      messageContent = content;
    },
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
    expect(view?.actions).toEqual([{ type: "trigger_turn", guidedTemplate: "Shift the pacing." }]);
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

// ── the picker read model, over the same registry the mint uses ───────────────────────────────────────

test("listRulePresets projects every committed preset in catalogue order and carries no CEL", async () => {
  const f = await setup();
  const views = f.svc.listRulePresets();

  expect(views.map((v) => v.id)).toEqual(["pacingNudge", "illustrateScenes", "diceChips", "clockFires", "sceneVeil", "callback", "cutaways"]);
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
