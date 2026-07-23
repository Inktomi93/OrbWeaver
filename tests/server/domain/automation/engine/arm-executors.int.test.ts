// .int tests for the A6 arm executors (automation-design/03; 05 §A6). Each LIVE arm renders its templates
// then dispatches through the injected `AutomationOps` (captured here) — we assert the op call + args, the
// spend accounting, the world-info attachment/cap guards, and the typed refusals for the v1-unwired +
// reserved arms. Real libSQL for the arms that read canon (global vars, book attachment, present members).

import type { AutomationAction, AutomationBusEvent, AutomationCelEnv, TriggerFact } from "@orb/contracts/automation";
import { automationActionSchema } from "@orb/contracts/automation";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { automationRules, chatBooks, worldBooks, worldEntries } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type {
  ArmDispatch,
  ArmExecutorDeps,
  AutomationImageRequest,
  AutomationImageResult,
  AutomationOps,
  AutomationTurnRequest,
  AutomationTurnResult,
  DispatchFrame,
} from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { createSpendAccumulator } from "../../../../../packages/server/src/domain/automation/engine/spend-gate.ts";
import { upsertBudget } from "../../../../../packages/server/src/domain/automation/persistence/budgets.ts";
import { insertFire } from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
import { selectGlobalVariable } from "../../../../../packages/server/src/domain/automation/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { seedUser } from "../_support.ts";

/** A stable sort for branded-string ids (biome `useArraySortCompare`). */
function byId(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

const FIXED_NOW_MS = 1_700_000_000_000; // 2023-11-14T22:13:20Z (a fixed UTC day for the spend rollover).
const FIXED_PRNG = (): number => 0.42;

/** Everything the captured `AutomationOps` + notify sink recorded. */
interface Captured {
  readonly varOps: { chatId: ChatId; ops: readonly VarOp[] }[];
  readonly upserts: {
    authorUserId: UserId;
    bookId: WorldBookId;
    entries: readonly { title: string; keys: readonly string[]; content: string; span?: unknown }[];
  }[];
  readonly notifications: NotificationEvent[];
  readonly images: AutomationImageRequest[];
  readonly bus: AutomationBusEvent[];
  /** BG-F — captured `set_chat_background` writes + the quiet-op prompts the arm sent. */
  readonly setBackgrounds: { authorUserId: UserId; chatId: ChatId; background: ThemeBackground }[];
  readonly quietPrompts: string[];
  /** 1.6 — captured `trigger_turn` → `requestTurn` calls. */
  readonly turns: AutomationTurnRequest[];
}

/** BG-F harness overrides — the candidate library the pick sees + the quiet-op's canned reply (the model's
 *  chosen name). */
interface BgOverrides {
  readonly choices?: readonly { name: string; background: ThemeBackground }[];
  readonly quietReply?: string;
  readonly quietCostUsd?: number;
  /** BG-F — force the chat-background write to REJECT (models the verb's host-authority refusal on a lost-
   *  authority race), so the arm's typed-`arm_error` mapping is exercised. */
  readonly setChatBackgroundThrows?: Error;
}

/** 1.6 — trigger_turn harness overrides: the canned `requestTurn` result (the summed cost + reply count), or a
 *  forced REJECT (models the engine's consent/budget/authority refusal → the arm's typed `arm_error` map). */
interface TurnOverrides {
  readonly result?: AutomationTurnResult;
  readonly throws?: Error;
}

function makeHarness(
  db: Db,
  imageResult: AutomationImageResult = { costUsd: 0.02, imageCount: 1 },
  bg: BgOverrides = {},
  turn: TurnOverrides = {},
): { dispatch: ArmDispatch; captured: Captured } {
  const captured: Captured = { varOps: [], upserts: [], notifications: [], images: [], bus: [], setBackgrounds: [], quietPrompts: [], turns: [] };
  const ops: AutomationOps = {
    chat: {
      getMessageFact: () => Promise.resolve(null),
      getTurnOrigin: () => Promise.resolve(null),
      readVariables: () => Promise.resolve({}),
      readChoicePicks: () => Promise.resolve({}),
      applyVariableOps: (chatId, varOps) => {
        captured.varOps.push({ chatId, ops: varOps });
        return Promise.resolve();
      },
      listBackgroundChoices: () => Promise.resolve(bg.choices ?? []),
      setChatBackground: (args) => {
        if (bg.setChatBackgroundThrows !== undefined) {
          return Promise.reject(bg.setChatBackgroundThrows);
        }
        captured.setBackgrounds.push(args);
        return Promise.resolve();
      },
      requestTurn: (req) => {
        if (turn.throws !== undefined) {
          return Promise.reject(turn.throws);
        }
        captured.turns.push(req);
        return Promise.resolve(turn.result ?? { costUsd: 0.03, messageCount: 1 });
      },
    },
    worldInfo: {
      upsertEntries: (args) => {
        captured.upserts.push(args);
        return Promise.resolve({ inserted: 1, updated: 0, skippedHandEdited: 0 });
      },
    },
    notifications: {
      emit: (event) => {
        captured.notifications.push(event);
        return Promise.resolve();
      },
    },
    imagery: {
      generatePicture: (req) => {
        captured.images.push(req);
        return Promise.resolve(imageResult);
      },
    },
    summarizeQuiet: ({ prompt }) => {
      captured.quietPrompts.push(prompt);
      return Promise.resolve({ text: bg.quietReply ?? "", costUsd: bg.quietCostUsd ?? 0 });
    },
  };
  const deps: ArmExecutorDeps = { db, ops, prng: FIXED_PRNG, notify: (event) => captured.bus.push(event) };
  return { dispatch: createArmExecutors(deps), captured };
}

/** Build a dispatch frame for an arm — a fresh spend accumulator, an empty CEL env unless overridden. */
function makeFrame(args: { chatId: ChatId; authorUserId: UserId; ruleId?: AutomationRuleId; vars?: Record<string, string> }): DispatchFrame {
  const env: AutomationCelEnv = {
    vars: args.vars ?? {},
    choice: {},
    global: {},
    chat: { id: args.chatId, messageCount: 0 },
    now: { epochMs: FIXED_NOW_MS, hour: 22, dayOfWeek: 2 },
  };
  const fact: TriggerFact = { type: "chatOpened", bus: "chat", chatId: args.chatId };
  return {
    chatId: args.chatId,
    authorUserId: args.authorUserId,
    fact,
    env,
    origin: { ruleId: args.ruleId ?? mintTypeId(ID_PREFIX.automationRule), automationDepth: 1 },
    now: FIXED_NOW_MS,
    spend: createSpendAccumulator(),
  };
}

async function setup(): Promise<{ db: Db; host: UserId; chatId: ChatId }> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedChat(db, "auto");
  await seedParticipant(db, { chatId, key: "auto_host", userId: host, role: "host" });
  return { db, host, chatId };
}

// ── 1.1 set_variable ────────────────────────────────────────────────────────────────────────────────
test("set_variable chat scope 'set' renders the value + writes a VarOp through applyVariableOps", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const action: Extract<AutomationAction, { type: "set_variable" }> = { type: "set_variable", scope: "chat", key: "mood", op: "set", value: "grim-{{roll:1}}" };
  const outcome = await dispatch(action, makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toEqual({ ok: true });
  expect(captured.varOps).toHaveLength(1);
  expect(captured.varOps[0]).toEqual({ chatId, ops: [{ op: "set", key: "mood", value: "grim-1" }] });
});

test("set_variable chat scope 'inc' computes against the current folded value (operand)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const action: Extract<AutomationAction, { type: "set_variable" }> = { type: "set_variable", scope: "chat", key: "score", op: "inc", value: "5" };
  await dispatch(action, makeFrame({ chatId, authorUserId: host, vars: { score: "10" } }));

  expect(captured.varOps[0]?.ops).toEqual([{ op: "set", key: "score", value: "15" }]);
});

test("set_variable chat scope WRITES THROUGH the shared env: [set hp=5, inc hp] ⇒ 6 (F2 — order is semantics)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  // ONE frame ⇒ ONE shared env.vars, exactly as the dispatch engine hands both arms of a rule the same env.
  const frame = makeFrame({ chatId, authorUserId: host }); // env.vars starts empty (hp unset)

  await dispatch({ type: "set_variable", scope: "chat", key: "hp", op: "set", value: "5" }, frame);
  await dispatch({ type: "set_variable", scope: "chat", key: "hp", op: "inc" }, frame); // operand default 1

  // Without write-through the inc read a stale "0" → wrote "1"; with it, inc reads the just-set "5" → "6".
  expect(captured.varOps.map((v) => v.ops)).toEqual([[{ op: "set", key: "hp", value: "5" }], [{ op: "set", key: "hp", value: "6" }]]);
  // The shared env now reflects the composed write (a later predicate / template reads 6).
  expect(frame.env.vars["hp"]).toBe("6");
});

test("set_variable chat-scope delete write-through clears the shared env (F2 — a later has()/read sees it gone)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host, vars: { flag: "on" } });

  await dispatch({ type: "set_variable", scope: "chat", key: "flag", op: "delete" }, frame);

  expect("flag" in frame.env.vars).toBe(false);
});

test("set_variable global scope writes the author's own plane (real db)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch } = makeHarness(db);
  await dispatch({ type: "set_variable", scope: "global", key: "streak", op: "set", value: "hot" }, makeFrame({ chatId, authorUserId: host }));
  expect(await selectGlobalVariable(db, host, "streak")).toBe("hot");

  await dispatch({ type: "set_variable", scope: "global", key: "streak", op: "delete" }, makeFrame({ chatId, authorUserId: host }));
  expect(await selectGlobalVariable(db, host, "streak")).toBeNull();
});

// ── 1.3 insert_world_info_entry ───────────────────────────────────────────────────────────────────────
async function seedAttachedBook(db: Db, host: UserId, chatId: ChatId): Promise<WorldBookId> {
  const bookId = mintTypeId(ID_PREFIX.worldBook);
  await db.insert(worldBooks).values({ id: bookId, ownerId: host, name: "auto-book" });
  await db.insert(chatBooks).values({ chatId, worldBookId: bookId });
  return bookId;
}

test("insert_world_info_entry upserts a ruleId-namespaced entry into an ATTACHED book", async () => {
  const { db, host, chatId } = await setup();
  const bookId = await seedAttachedBook(db, host, chatId);
  const { dispatch, captured } = makeHarness(db);
  const ruleId = mintTypeId(ID_PREFIX.automationRule);
  const action: Extract<AutomationAction, { type: "insert_world_info_entry" }> = {
    type: "insert_world_info_entry",
    bookId,
    entryKey: "weather",
    keys: ["storm"],
    contentTemplate: "The sky darkens.",
    position: "before",
  };
  const outcome = await dispatch(action, makeFrame({ chatId, authorUserId: host, ruleId }));

  expect(outcome).toEqual({ ok: true });
  expect(captured.upserts).toHaveLength(1);
  expect(captured.upserts[0]?.entries).toEqual([{ title: `auto/${ruleId}:weather`, keys: ["storm"], content: "The sky darkens." }]);
});

test("insert_world_info_entry refuses a book NOT attached to the chat", async () => {
  const { db, host, chatId } = await setup();
  const bookId = mintTypeId(ID_PREFIX.worldBook);
  await db.insert(worldBooks).values({ id: bookId, ownerId: host, name: "detached" });
  const { dispatch, captured } = makeHarness(db);
  const outcome = await dispatch(
    { type: "insert_world_info_entry", bookId, entryKey: "k", keys: [], contentTemplate: "x", position: "before" },
    makeFrame({ chatId, authorUserId: host }),
  );

  expect(outcome?.ok).toBe(false);
  expect(captured.upserts).toHaveLength(0);
});

test("insert_world_info_entry refuses a NEW entry once the rule owns 64 in the book", async () => {
  const { db, host, chatId } = await setup();
  const bookId = await seedAttachedBook(db, host, chatId);
  const ruleId = mintTypeId(ID_PREFIX.automationRule);
  const prefix = `auto/${ruleId}:`;
  await db.insert(worldEntries).values(
    Array.from({ length: 64 }, (_v, i) => ({
      id: mintTypeId(ID_PREFIX.worldEntry),
      worldBookId: bookId,
      title: `${prefix}k${i}`,
      description: null,
      content: "seeded",
      keys: null,
      enabled: true,
      priority: 0,
      ignoreBudget: false,
      metadata: null,
      createdAt: FIXED_NOW_MS,
    })),
  );
  const { dispatch } = makeHarness(db);
  const action: Extract<AutomationAction, { type: "insert_world_info_entry" }> = {
    type: "insert_world_info_entry",
    bookId,
    entryKey: "k64",
    keys: [],
    contentTemplate: "over",
    position: "before",
  };
  const outcome = await dispatch(action, makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome?.ok).toBe(false);
});

// ── 1.4 surface_quick_reply ─────────────────────────────────────────────────────────────────────────
test("surface_quick_reply emits quickReplySurfaced with rendered send text", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const ruleId = mintTypeId(ID_PREFIX.automationRule);
  const action: Extract<AutomationAction, { type: "surface_quick_reply" }> = {
    type: "surface_quick_reply",
    choices: [{ label: "Flee", sendTemplate: "I run from {{roll:1}} danger" }],
  };
  const outcome = await dispatch(action, makeFrame({ chatId, authorUserId: host, ruleId }));

  expect(outcome).toEqual({ ok: true });
  expect(captured.bus).toEqual([
    { type: "quickReplySurfaced", chatId, source: { kind: "rule", ruleId }, choices: [{ label: "Flee", sendText: "I run from 1 danger" }] },
  ]);
});

// ── 1.5 post_notification ───────────────────────────────────────────────────────────────────────────
test("post_notification host → one automation-notice to the author", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const ruleId = mintTypeId(ID_PREFIX.automationRule);
  await dispatch({ type: "post_notification", recipient: "host", messageTemplate: "the tavern stirs" }, makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(captured.notifications).toEqual([
    { type: "automation-notice", recipientUserId: host, chatId, source: { kind: "rule", ruleId }, message: "the tavern stirs" },
  ]);
});

test("post_notification all_members → one automation-notice per present human member", async () => {
  const { db, host, chatId } = await setup();
  const guest = await seedUser(db, "user_guest");
  await seedParticipant(db, { chatId, key: "auto_guest", userId: guest, role: "member" });
  const { dispatch, captured } = makeHarness(db);
  await dispatch({ type: "post_notification", recipient: "all_members", messageTemplate: "hi" }, makeFrame({ chatId, authorUserId: host }));
  expect(captured.notifications.map((n) => n.recipientUserId).sort(byId)).toEqual([host, guest].sort(byId));
});

// ── 1.7 generate_image (the /imagine engine — SPEND) ──────────────────────────────────────────────────
test("generate_image renders the prompt + maps the FULL IC-C args onto imagery.generatePicture", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, { costUsd: 0.03, imageCount: 2 });
  const subjectCharacterId = mintTypeId(ID_PREFIX.character);
  const action = automationActionSchema.parse({
    type: "generate_image",
    mode: "character",
    prompt: "a {{roll:1}}-eyed raven",
    negative: "blurry",
    n: 2,
    size: "portrait",
    subjectCharacterId,
    useAvatarReference: true,
    reuse: "never",
  }) as Extract<AutomationAction, { type: "generate_image" }>;
  const frame = makeFrame({ chatId, authorUserId: host });
  const outcome = await dispatch(action, frame);

  expect(outcome).toEqual({ ok: true });
  expect(captured.images).toHaveLength(1);
  // The NON-projected fields (subjectCharacterId/useAvatarReference — the I4 lesson) ride through.
  expect(captured.images[0]).toEqual({
    authorUserId: host,
    chatId,
    automationDepth: 1, // the firing rule's child depth (origin.automationDepth) — compose stamps it on the posted image (N1)
    mode: "character",
    prompt: "a 1-eyed raven",
    negative: "blurry",
    n: 2,
    size: "portrait",
    subjectCharacterId,
    useAvatarReference: true,
    reuse: "never",
    quiet: false, // the default — the arm threads `quiet` so compose can post the image in-chat (F1, 03 §1.7)
  });
  // The returned cost is reserved on the spend accumulator (the day $ ceiling reads it).
  expect(frame.spend.actions()).toBe(1);
  expect(frame.spend.usd()).toBeCloseTo(0.03);
});

test("generate_image forwards the MA-8 diffusion knobs verbatim onto imagery.generatePicture", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, { costUsd: 0.03, imageCount: 1 });
  const action = automationActionSchema.parse({
    type: "generate_image",
    mode: "free",
    prompt: "a lighthouse",
    params: { steps: 28, cfg: 6.5, sampler: "euler", scheduler: "karras", seed: 42 },
  }) as Extract<AutomationAction, { type: "generate_image" }>;
  await dispatch(action, makeFrame({ chatId, authorUserId: host }));

  expect(captured.images).toHaveLength(1);
  expect(captured.images[0]?.params).toEqual({ steps: 28, cfg: 6.5, sampler: "euler", scheduler: "karras", seed: 42 });
});

test("generate_image threads quiet through to the op (F1 — quiet:true generates silently, default posts in-chat)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  // quiet:true — the op must see it (compose then SKIPS the in-chat post; the image is gallery-only).
  await dispatch(
    automationActionSchema.parse({ type: "generate_image", mode: "free", prompt: "x", quiet: true }) as Extract<AutomationAction, { type: "generate_image" }>,
    makeFrame({ chatId, authorUserId: host }),
  );
  expect(captured.images[0]?.quiet).toBe(true);

  // default (quiet omitted) → quiet:false → compose posts the image into the chat.
  await dispatch(
    automationActionSchema.parse({ type: "generate_image", mode: "free", prompt: "y" }) as Extract<AutomationAction, { type: "generate_image" }>,
    makeFrame({ chatId, authorUserId: host }),
  );
  expect(captured.images[1]?.quiet).toBe(false);
});

/** Insert a minimal enabled rule row (the `automation_fires.rule_id` FK target). */
async function seedRule(db: Db, host: UserId, chatId: ChatId): Promise<AutomationRuleId> {
  const ruleId = mintTypeId(ID_PREFIX.automationRule);
  await db.insert(automationRules).values({
    id: ruleId,
    ownerId: host,
    chatId,
    name: "spender",
    position: 0,
    triggerBus: "chat",
    triggerType: "chatOpened",
    actions: [],
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  });
  return ruleId;
}

test("generate_image refuses (budget_refused) when the per-chat spend-action ceiling is already met", async () => {
  const { db, host, chatId } = await setup();
  await upsertBudget(db, chatId, { maxSpendActionsPerDay: 1 }, FIXED_NOW_MS);
  // A prior spend fire TODAY (the fire log is the count source).
  await insertFire(db, {
    id: mintTypeId(ID_PREFIX.automationFire),
    ruleId: await seedRule(db, host, chatId),
    chatId,
    triggerType: "chatOpened",
    outcome: "fired",
    detail: { spendActions: 1, spendUsd: 0.01 },
    automationDepth: 0,
    firedAt: FIXED_NOW_MS,
  });
  const { dispatch, captured } = makeHarness(db);
  const action = automationActionSchema.parse({ type: "generate_image", mode: "free", prompt: "x" }) as Extract<AutomationAction, { type: "generate_image" }>;
  const outcome = await dispatch(action, makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toEqual({ ok: false, kind: "budget_refused", detail: "spend_actions_daily" });
  expect(captured.images).toHaveLength(0); // refused BEFORE the op.
});

test("generate_image refuses the SECOND spend arm in one rule once the in-flight $ ceiling is hit", async () => {
  const { db, host, chatId } = await setup();
  await upsertBudget(db, chatId, { maxUsdPerDay: 0.05, maxSpendActionsPerDay: 10 }, FIXED_NOW_MS);
  const { dispatch, captured } = makeHarness(db, { costUsd: 0.05, imageCount: 1 });
  const action = automationActionSchema.parse({ type: "generate_image", mode: "free", prompt: "x" }) as Extract<AutomationAction, { type: "generate_image" }>;
  const frame = makeFrame({ chatId, authorUserId: host });

  expect(await dispatch(action, frame)).toEqual({ ok: true }); // reserves 0.05
  const second = await dispatch(action, frame);
  expect(second).toEqual({ ok: false, kind: "budget_refused", detail: "usd_daily" });
  expect(captured.images).toHaveLength(1); // only the first op ran.
  // The first arm's spend IS tracked on the frame (dispatch persists it on the abort terminal — no leak).
  expect(frame.spend.actions()).toBe(1);
  expect(frame.spend.usd()).toBeCloseTo(0.05);
});

// ── 1.6 trigger_turn (the autonomous chat turn — SPEND-classed; now WIRED to requestTurn) ──────────────
test("trigger_turn dispatches requestTurn with the author/chat/depth + rendered guided steer, and counts the spend", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host }); // origin.automationDepth = 1
  const speaker = mintTypeId(ID_PREFIX.character);
  const action: Extract<AutomationAction, { type: "trigger_turn" }> = { type: "trigger_turn", speakerCharacterId: speaker, guidedTemplate: "steer-{{roll:1}}" };

  const outcome = await dispatch(action, frame);

  expect(outcome).toEqual({ ok: true });
  expect(captured.turns).toHaveLength(1);
  // The funder = the rule AUTHOR (→ triggeredBy); the cascade depth is the origin CHILD-depth; the steer is
  // macro-rendered (the arm renders `guidedTemplate` before the op). initiator is fixed at compose (not here).
  expect(captured.turns[0]).toEqual({ authorUserId: host, chatId, automationDepth: 1, speakerCharacterId: speaker, guided: "steer-1" });
  // SPEND: one action + the summed reply cost (03 §3) — feeds the per-day count + $ ceilings.
  expect(frame.spend.actions()).toBe(1);
  expect(frame.spend.usd()).toBeCloseTo(0.03);
});

test("trigger_turn with no steer / no forced speaker omits both fields (normal arbitration)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host });

  const outcome = await dispatch({ type: "trigger_turn" }, frame);

  expect(outcome).toEqual({ ok: true });
  expect(captured.turns[0]).toEqual({ authorUserId: host, chatId, automationDepth: 1 });
});

test("trigger_turn maps a requestTurn refusal (consent/authority/depth throw) to a typed arm_error, no fabricated success", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(
    db,
    undefined,
    {},
    { throws: new Error("a non-owner-triggered max-pro-sub turn requires explicit owner consent") },
  );
  const frame = makeFrame({ chatId, authorUserId: host });

  const outcome = await dispatch({ type: "trigger_turn" }, frame);

  expect(outcome).toMatchObject({ ok: false, kind: "arm_error" });
  // The engine refused BEFORE any generation — no spend is recorded (the arm never reached `spend.add`).
  expect(frame.spend.actions()).toBe(0);
  expect(captured.turns).toHaveLength(0);
});

// ── the v1-unwired + reserved arms are TYPED REFUSALS, and the dispatcher is exhaustive ───────────────
test("transform_draft + the reserved arms are typed arm_error refusals (no op)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host });

  const transform = await dispatch({ type: "transform_draft", target: "user_input", template: "x" }, frame);
  expect(transform).toMatchObject({ ok: false, kind: "arm_error" });

  const reserved = await dispatch({ type: "force_activate_entries", entryIds: [] }, frame);
  expect(reserved).toMatchObject({ ok: false, kind: "arm_error" });

  // No live effect from any refusal.
  expect(captured).toEqual({ varOps: [], upserts: [], notifications: [], images: [], bus: [], setBackgrounds: [], quietPrompts: [], turns: [] });
});

// ── 1.8 set_chat_background (BG-F — the /autobg quiet-pick engine) ─────────────────────────────────────
const BG_ALICE: ThemeBackground = {
  kind: "asset",
  seededId: "",
  externalUrl: "",
  assetId: "asset_dawn",
  assetHash: "hash_dawn",
  mime: "image/png",
  provenanceUrl: "",
};
const BG_BOB: ThemeBackground = {
  kind: "asset",
  seededId: "",
  externalUrl: "",
  assetId: "asset_dusk",
  assetHash: "hash_dusk",
  mime: "image/png",
  provenanceUrl: "",
};
const AUTOBG_CHOICES = [
  { name: "Dawn Meadow", background: BG_ALICE },
  { name: "Dusk Harbor", background: BG_BOB },
] as const;

test("set_chat_background: the quiet pick is sent the candidate NAMES and its choice is written to the chat background", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, undefined, { choices: AUTOBG_CHOICES, quietReply: "Dusk Harbor" });

  const outcome = await dispatch({ type: "set_chat_background" }, makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toEqual({ ok: true });
  // The quiet op (the mint) got a prompt listing the real candidate names.
  expect(captured.quietPrompts).toHaveLength(1);
  expect(captured.quietPrompts[0]).toContain("Dawn Meadow");
  expect(captured.quietPrompts[0]).toContain("Dusk Harbor");
  // The model's pick matched a choice and was written as the chat background (host-scoped, author = host).
  expect(captured.setBackgrounds).toEqual([{ authorUserId: host, chatId, background: BG_BOB }]);
});

test("set_chat_background: the name match is case/space-insensitive", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, undefined, { choices: AUTOBG_CHOICES, quietReply: "  dawn meadow  " });
  await dispatch({ type: "set_chat_background" }, makeFrame({ chatId, authorUserId: host }));
  expect(captured.setBackgrounds).toEqual([{ authorUserId: host, chatId, background: BG_ALICE }]);
});

test("set_chat_background: a host-authority refusal from the write is a typed arm_error, never a raw rejection (DEF-11 race)", async () => {
  const { db, host, chatId } = await setup();
  // The author lost host authority between the pre-dispatch gate and the write (a host-handoff race), so the
  // verb refuses. The arm must surface a typed arm_error (the rule stays healthy), never let the rejection escape.
  const { dispatch, captured } = makeHarness(db, undefined, {
    choices: AUTOBG_CHOICES,
    quietReply: "Dusk Harbor",
    setChatBackgroundThrows: new Error("chat: not_host"),
  });

  const outcome = await dispatch({ type: "set_chat_background" }, makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toEqual({ ok: false, kind: "arm_error", detail: expect.stringContaining("not_host") });
  expect(captured.setBackgrounds).toEqual([]);
});

test("set_chat_background: an empty library is a soft no-op — no quiet call, no write", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, undefined, { choices: [], quietReply: "anything" });
  const outcome = await dispatch({ type: "set_chat_background" }, makeFrame({ chatId, authorUserId: host }));
  expect(outcome).toEqual({ ok: true });
  expect(captured.quietPrompts).toEqual([]);
  expect(captured.setBackgrounds).toEqual([]);
});

test("set_chat_background: an off-list / empty quiet reply is a soft no-op — no write, rule stays healthy", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, undefined, { choices: AUTOBG_CHOICES, quietReply: "Some Other Place" });
  const outcome = await dispatch({ type: "set_chat_background" }, makeFrame({ chatId, authorUserId: host }));
  expect(outcome).toEqual({ ok: true });
  expect(captured.quietPrompts).toHaveLength(1);
  expect(captured.setBackgrounds).toEqual([]);
});

test("set_chat_background: the quiet LLM pick IS spend — refused (budget_refused) when the day ceiling is met, no model call", async () => {
  const { db, host, chatId } = await setup();
  await upsertBudget(db, chatId, { maxSpendActionsPerDay: 1 }, FIXED_NOW_MS);
  // A prior spend fire TODAY consumes the single-action ceiling (the fire log is the count source).
  await insertFire(db, {
    id: mintTypeId(ID_PREFIX.automationFire),
    ruleId: await seedRule(db, host, chatId),
    chatId,
    triggerType: "chatOpened",
    outcome: "fired",
    detail: { spendActions: 1, spendUsd: 0.01 },
    automationDepth: 0,
    firedAt: FIXED_NOW_MS,
  });
  const { dispatch, captured } = makeHarness(db, undefined, { choices: AUTOBG_CHOICES, quietReply: "Dusk Harbor" });

  const outcome = await dispatch({ type: "set_chat_background" }, makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toEqual({ ok: false, kind: "budget_refused", detail: "spend_actions_daily" });
  expect(captured.quietPrompts).toEqual([]); // refused BEFORE the model call
  expect(captured.setBackgrounds).toEqual([]);
});

test("set_chat_background: the quiet call's cost is accumulated on the frame spend (the day $ ceiling reads it)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch } = makeHarness(db, undefined, { choices: AUTOBG_CHOICES, quietReply: "Dawn Meadow", quietCostUsd: 0.004 });
  const frame = makeFrame({ chatId, authorUserId: host });
  await dispatch({ type: "set_chat_background" }, frame);
  expect(frame.spend.actions()).toBe(1);
  expect(frame.spend.usd()).toBeCloseTo(0.004);
});

test("the dispatcher handles EVERY action type (no unhandled-arm throw — the switch is exhaustive)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host });
  // The `default: never` in runArm is the compile-time exhaustiveness pin; this proves it at RUNTIME too —
  // every action-type discriminant reaches a case (a bare `{ type }` cast is enough to route it; the arm may
  // still refuse on missing fields, but it must NOT hit the "unhandled automation arm" default).
  const hitDefault = await Promise.all(
    automationActionSchema.options.map(async (option) => {
      const type = (option as { shape: { type: { value: string } } }).shape.type.value;
      try {
        // FABRICATION-OK: a deliberately field-less action — the probe only tests the discriminant ROUTES to a case (not `default: never`); the arm may refuse/crash on the missing fields.
        await dispatch({ type } as AutomationAction, frame);
        return false;
      } catch (err) {
        return err instanceof Error && err.message.startsWith("unhandled automation arm");
      }
    }),
  );
  expect(hitDefault.some((hit) => hit)).toBe(false);
});

// A render error (a strict-arg macro fault) is a typed refusal, never a mis-rendered effect.
test("a template render error surfaces as arm_error without calling the op", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  // `{{roll}}` with no arg is a strict-args error (02 §5).
  const action: Extract<AutomationAction, { type: "set_variable" }> = { type: "set_variable", scope: "chat", key: "k", op: "set", value: "{{roll}}" };
  const outcome = await dispatch(action, makeFrame({ chatId, authorUserId: host }));
  expect(outcome?.ok).toBe(false);
  expect(captured.varOps).toHaveLength(0);
});
