// .int tests for the A6 arm executors (automation-design/03; 05 §A6). Each LIVE arm renders its templates
// then dispatches through the injected `AutomationOps` (captured here) — we assert the op call + args, the
// world-info attachment/cap guards, and the typed refusals for the v1-unwired + reserved arms. Real libSQL for
// the arms that read canon (global vars, book attachment, present members). (The per-day spend ceilings were
// stripped 2026-07-24 — enterprise spend enforcement; loop safety rides the per-chat fire-rate cap + the chat
// member turn budget + the cascade guard.)

import type { AutomationAction, AutomationActionInput, AutomationBusEvent, AutomationCelEnv, TriggerFact } from "@orb/contracts/automation";
import { AUTOMATION_VARIABLE_VALUE_MAX, automationActionSchema } from "@orb/contracts/automation";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { ProseOverrides } from "@orb/contracts/prose";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { chatBooks, worldBooks, worldEntries } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type {
  ArmDispatch,
  ArmExecutorDeps,
  AutomationImageRequest,
  AutomationImageResult,
  AutomationOps,
  AutomationToolOutcome,
  AutomationToolRequest,
  AutomationTurnRequest,
  AutomationTurnResult,
  DispatchFrame,
} from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { selectGlobalVariable } from "../../../../../packages/server/src/domain/automation/persistence/queries.ts";
import { createSuggestionStore } from "../../../../../packages/server/src/domain/automation/substrate/suggestions.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { arm, NO_TOOLS, seedUser } from "../_support.ts";

/** A stable sort for branded-string ids (biome `useArraySortCompare`). */
function byId(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

const FIXED_NOW_MS = 1_700_000_000_000; // 2023-11-14T22:13:20Z (a fixed UTC day).
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
  /** BG-F — force the chat-background write to REJECT (models the verb's host-authority refusal on a lost-
   *  authority race), so the arm's typed-`arm_error` mapping is exercised. */
  readonly setChatBackgroundThrows?: Error;
  /** PROSE-1 census 91 — the ROOM HOST's prose overrides the quiet pick's two authored clauses resolve under. */
  readonly prose?: ProseOverrides;
}

/** 1.6 — trigger_turn harness overrides: the canned `requestTurn` result (reply count), or a forced REJECT
 *  (models the engine's consent/authority refusal → the arm's typed `arm_error` map). */
interface TurnOverrides {
  readonly result?: AutomationTurnResult;
  readonly throws?: Error;
}

/** The per-arm harness knobs, ONE bag. Was four positional params until `run_tool` (D146) needed a fifth seam
 *  — a bag rather than a fifth position because the call sites that pass nothing read identically either way,
 *  and the ones that pass a middle knob stop counting `undefined`s. */
interface HarnessOptions {
  readonly imageResult?: AutomationImageResult;
  readonly bg?: BgOverrides;
  readonly turn?: TurnOverrides;
  /** D146 — the `run_tool` seam. Default {@link NO_TOOLS}: nothing is drivable, which is what an arm test that
   *  does not care about tools should see (and a `run_tool` arm run against it PAUSES, never silently runs). */
  readonly tools?: AutomationOps["tools"];
}

function makeHarness(db: Db, opts: HarnessOptions = {}): { dispatch: ArmDispatch; captured: Captured } {
  const imageResult: AutomationImageResult = opts.imageResult ?? { imageCount: 1 };
  const bg: BgOverrides = opts.bg ?? {};
  const turn: TurnOverrides = opts.turn ?? {};
  const captured: Captured = { varOps: [], upserts: [], notifications: [], images: [], bus: [], setBackgrounds: [], quietPrompts: [], turns: [] };
  const ops: AutomationOps = {
    tools: opts.tools ?? NO_TOOLS,
    chat: {
      getMessageFact: () => Promise.resolve(null),
      getTurnOrigin: () => Promise.resolve(null),
      // The visibility op is inert (fail-closed) — this suite never drives the plugin fan-out that consumes it.
      resolveViewerVisibility: () => Promise.resolve(null),
      readVariables: () => Promise.resolve({}),
      readChoicePicks: () => Promise.resolve({}),
      resolveChatProse: () => Promise.resolve(bg.prose ?? {}),
      applyVariableOps: (chatId, varOps) => {
        captured.varOps.push({ chatId, ops: varOps });
        return Promise.resolve({ outcome: "applied" });
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
        return Promise.resolve(turn.result ?? { messageCount: 1 });
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
      return Promise.resolve({ text: bg.quietReply ?? "" });
    },
  };
  const deps: ArmExecutorDeps = {
    db,
    ops,
    prng: FIXED_PRNG,
    notify: (event) => captured.bus.push(event),
    // S4: a real store + minter, so a confirm-first arm in these tests STASHES instead of running.
    suggestions: createSuggestionStore(),
    newSuggestionId: () => mintTypeId(ID_PREFIX.automationSuggestion),
  };
  return { dispatch: createArmExecutors(deps), captured };
}

/** Build a dispatch frame for an arm — an empty CEL env unless overridden. */
function makeFrame(args: {
  chatId: ChatId;
  authorUserId: UserId;
  ruleId?: AutomationRuleId;
  vars?: Record<string, string>;
  /** The TRIGGERING fact. Default: a `chatOpened` fact, which carries no `message` — so an arm that reads
   *  the actor (`post_notification`'s actor-excluding recipient) sees the honest "no human act" shape unless
   *  a test hands it a message-bearing fact. */
  fact?: TriggerFact;
}): DispatchFrame {
  const env: AutomationCelEnv = {
    vars: args.vars ?? {},
    choice: {},
    global: {},
    chat: { id: args.chatId, messageCount: 0 },
    now: { epochMs: FIXED_NOW_MS, hour: 22, dayOfWeek: 2 },
  };
  const fact: TriggerFact = args.fact ?? { type: "chatOpened", bus: "chat", chatId: args.chatId };
  return {
    chatId: args.chatId,
    authorUserId: args.authorUserId,
    fact,
    env,
    origin: { ruleId: args.ruleId ?? mintTypeId(ID_PREFIX.automationRule), automationDepth: 1 },
    now: FIXED_NOW_MS,
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
  const action: Extract<AutomationActionInput, { type: "set_variable" }> = {
    type: "set_variable",
    scope: "chat",
    key: "mood",
    op: "set",
    value: "grim-{{roll:1}}",
  };
  const outcome = await dispatch(arm(action), makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toEqual({ ok: true });
  expect(captured.varOps).toHaveLength(1);
  expect(captured.varOps[0]).toEqual({ chatId, ops: [{ op: "set", key: "mood", value: "grim-1" }] });
});

test("set_variable chat scope 'inc' computes against the current folded value (operand)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const action: Extract<AutomationActionInput, { type: "set_variable" }> = { type: "set_variable", scope: "chat", key: "score", op: "inc", value: "5" };
  await dispatch(arm(action), makeFrame({ chatId, authorUserId: host, vars: { score: "10" } }));

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

// #1420 — `inc`/`dec` VALIDATE their inputs rather than coercing them. `Number.parseInt` is a PREFIX parser:
// it reads as far as it can and throws the rest away, so `"5cats"` silently became 5, `"3.9"` became 3, a
// wholly invalid operand collapsed to the default 1 (making a typo indistinguishable from writing nothing),
// and a non-numeric CURRENT value silently rebased the counter at 0. All four are now typed `arm_error`s the
// host reads on the fire log, and — the load-bearing half — NOTHING IS WRITTEN.
test("set_variable 'inc' REFUSES a junk operand instead of silently truncating it", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host, vars: { score: "10" } });

  for (const operand of ["5cats", "3.9", "", "  ", "1e3", "0x10", "nope"]) {
    const outcome = await dispatch({ type: "set_variable", scope: "chat", key: "score", op: "inc", value: operand }, frame);
    expect(outcome).toEqual({ ok: false, kind: "arm_error", detail: expect.stringContaining("needs whole numbers") });
  }
  // Not one write reached the plane, and the counter still reads its pre-arm value.
  expect(captured.varOps).toEqual([]);
  expect(frame.env.vars["score"]).toBe("10");
});

test("set_variable 'inc' REFUSES a non-numeric CURRENT value instead of rebasing the counter at 0", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host, vars: { score: "many" } });

  const outcome = await dispatch({ type: "set_variable", scope: "chat", key: "score", op: "inc", value: "1" }, frame);

  expect(outcome).toEqual({ ok: false, kind: "arm_error", detail: expect.stringContaining("current value 'many'") });
  expect(captured.varOps).toEqual([]);
});

test("set_variable 'inc'/'dec' still accept the legitimate spellings — signed, padded and whitespaced integers", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  // An ABSENT variable is a fresh counter at 0 (the call site's `?? "0"`), which is a configuration and not a
  // corruption — the refusal above is about junk, never about a rule firing for the first time.
  await dispatch({ type: "set_variable", scope: "chat", key: "fresh", op: "inc", value: " 7 " }, makeFrame({ chatId, authorUserId: host }));
  await dispatch(
    { type: "set_variable", scope: "chat", key: "score", op: "dec", value: "-2" },
    makeFrame({ chatId, authorUserId: host, vars: { score: "010" } }),
  );

  expect(captured.varOps.map((v) => v.ops)).toEqual([[{ op: "set", key: "fresh", value: "7" }], [{ op: "set", key: "score", value: "12" }]]);
});

// #1420, the write-through half of the same reserved-key defect the global plane had. A plain
// `env.vars[key] = value` for the key `__proto__` hits Object.prototype's inherited SETTER and creates no own
// property, so the DB write lands and the shared env — every later predicate, template and `inc` in the
// batch — cannot see it.
test("a chat variable named __proto__ lands as an OWN key on the shared env", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host });

  await dispatch({ type: "set_variable", scope: "chat", key: "__proto__", op: "set", value: "5" }, frame);

  expect(captured.varOps[0]?.ops).toEqual([{ op: "set", key: "__proto__", value: "5" }]);
  expect(Object.hasOwn(frame.env.vars, "__proto__")).toBe(true);
  // And the write-through composes: a later `inc` reads the value this arm just wrote.
  await dispatch({ type: "set_variable", scope: "chat", key: "__proto__", op: "inc" }, frame);
  expect(captured.varOps[1]?.ops).toEqual([{ op: "set", key: "__proto__", value: "6" }]);
});

// #1564 — the READ half of the same reserved-key hole. `frame.env.vars[key]` for `__proto__` answers
// `Object.prototype` on any plane that does not already own that key — an OBJECT where `runIncDec` needs a
// string — so a legal variable name turned an `inc` into `current.trim is not a function` and the isolated
// dispatch reported a generic `action_error` about a rule that was fine.
test("set_variable 'inc' on a __proto__ key the plane does not own is a FRESH COUNTER, not a crash", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host }); // env.vars is a plain {} — it does NOT own __proto__

  const outcome = await dispatch({ type: "set_variable", scope: "chat", key: "__proto__", op: "inc" }, frame);

  expect(outcome).toEqual({ ok: true });
  expect(captured.varOps[0]?.ops).toEqual([{ op: "set", key: "__proto__", value: "1" }]);
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
  const action: AutomationActionInput = {
    type: "insert_world_info_entry",
    bookId,
    entryKey: "weather",
    keys: ["storm"],
    contentTemplate: "The sky darkens.",
    position: "before",
  };
  const outcome = await dispatch(arm(action), makeFrame({ chatId, authorUserId: host, ruleId }));

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
    arm({ type: "insert_world_info_entry", bookId, entryKey: "k", keys: [], contentTemplate: "x", position: "before" }),
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
  const action: AutomationActionInput = {
    type: "insert_world_info_entry",
    bookId,
    entryKey: "k64",
    keys: [],
    contentTemplate: "over",
    position: "before",
  };
  const outcome = await dispatch(arm(action), makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome?.ok).toBe(false);
});

// ── 1.4 surface_quick_reply ─────────────────────────────────────────────────────────────────────────
test("surface_quick_reply emits quickReplySurfaced with rendered send text", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const ruleId = mintTypeId(ID_PREFIX.automationRule);
  const action: Extract<AutomationActionInput, { type: "surface_quick_reply" }> = {
    type: "surface_quick_reply",
    // S1: the per-choice consumption MODE is the author's declaration and travels verbatim to the member's
    // surface — the TEMPLATE is rendered, the mode is not a render product. Both members exercised here, so
    // a passthrough that dropped the field (or pinned one value) fails on the second choice.
    choices: [
      { label: "Flee", sendTemplate: "I run from {{roll:1}} danger", mode: "send" },
      { label: "Plan", sendTemplate: "We should", mode: "compose" },
    ],
  };
  const outcome = await dispatch(arm(action), makeFrame({ chatId, authorUserId: host, ruleId }));

  expect(outcome).toEqual({ ok: true });
  expect(captured.bus).toEqual([
    {
      type: "quickReplySurfaced",
      chatId,
      source: { kind: "rule", ruleId },
      choices: [
        { label: "Flee", sendText: "I run from 1 danger", mode: "send" },
        { label: "Plan", sendText: "We should", mode: "compose" },
      ],
    },
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

// C6 — the actor-excluding recipient. THE MATRIX, because the member's whole value is a difference between
// two members of the same roster: who is spared, and what happens when there is nobody to spare.
/** A `messageCommitted` fact authored by `author` — the shape the actor-excluding member resolves against. */
function committedBy(chatId: ChatId, author: UserId | null): TriggerFact {
  return {
    type: "messageCommitted",
    bus: "chat",
    chatId,
    message: { id: "message_probe", role: "user", authorUserId: author, characterId: null, seq: 1, content: "your move" },
  };
}

test("post_notification all_members_except_actor → every present human EXCEPT the fact's author", async () => {
  const { db, host, chatId } = await setup();
  const guest = await seedUser(db, "user_guest");
  await seedParticipant(db, { chatId, key: "auto_guest", userId: guest, role: "member" });
  const { dispatch, captured } = makeHarness(db);

  // The GUEST posted, so the guest is the one member who does not need telling.
  await dispatch(
    { type: "post_notification", recipient: "all_members_except_actor", messageTemplate: "your move" },
    makeFrame({ chatId, authorUserId: host, fact: committedBy(chatId, guest) }),
  );

  expect(captured.notifications.map((n) => n.recipientUserId)).toEqual([host]);
});

test("the actor-excluding member spares the HOST too when the host is the one who posted", async () => {
  // The exclusion follows the ACT, not the role — otherwise a host playing in their own async room would be
  // pinged by their own post, which is the exact notice the member exists to suppress.
  const { db, host, chatId } = await setup();
  const guest = await seedUser(db, "user_guest");
  await seedParticipant(db, { chatId, key: "auto_guest", userId: guest, role: "member" });
  const { dispatch, captured } = makeHarness(db);

  await dispatch(
    { type: "post_notification", recipient: "all_members_except_actor", messageTemplate: "your move" },
    makeFrame({ chatId, authorUserId: host, fact: committedBy(chatId, host) }),
  );

  expect(captured.notifications.map((n) => n.recipientUserId)).toEqual([guest]);
});

test("a fact with NO human author excludes nobody — there was no human act to spare", async () => {
  // A model-authored message (`authorUserId: null`) and a fact with no `message` at all (a turn fact) both
  // land here. Excluding nobody is the correct answer, not a fallback: the alternative is a silent no-op.
  const { db, host, chatId } = await setup();
  const guest = await seedUser(db, "user_guest");
  await seedParticipant(db, { chatId, key: "auto_guest", userId: guest, role: "member" });
  const { dispatch, captured } = makeHarness(db);

  await dispatch(
    { type: "post_notification", recipient: "all_members_except_actor", messageTemplate: "the scene moves" },
    makeFrame({ chatId, authorUserId: host, fact: committedBy(chatId, null) }),
  );
  // The default frame's `chatOpened` fact carries no `message` field at all — the same verdict by a
  // different absence, which is why both are pinned.
  await dispatch(
    { type: "post_notification", recipient: "all_members_except_actor", messageTemplate: "the scene moves" },
    makeFrame({ chatId, authorUserId: host }),
  );

  expect(captured.notifications.map((n) => n.recipientUserId).sort(byId)).toEqual([host, guest, host, guest].sort(byId));
});

// ── 1.7 generate_image (the /imagine engine) ──────────────────────────────────────────────────────────
test("generate_image renders the prompt + maps the FULL IC-C args onto imagery.generatePicture", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, { imageResult: { imageCount: 2 } });
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
  }) as Extract<AutomationActionInput, { type: "generate_image" }>;
  const frame = makeFrame({ chatId, authorUserId: host });
  const outcome = await dispatch(arm(action), frame);

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
});

test("generate_image threads quiet through to the op (F1 — quiet:true generates silently, default posts in-chat)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  // quiet:true — the op must see it (compose then SKIPS the in-chat post; the image is gallery-only).
  await dispatch(arm({ type: "generate_image", mode: "free", prompt: "x", quiet: true }), makeFrame({ chatId, authorUserId: host }));
  expect(captured.images[0]?.quiet).toBe(true);

  // default (quiet omitted) → quiet:false → compose posts the image into the chat.
  await dispatch(arm({ type: "generate_image", mode: "free", prompt: "y" }), makeFrame({ chatId, authorUserId: host }));
  expect(captured.images[1]?.quiet).toBe(false);
});

// ── 1.6 trigger_turn (the autonomous chat turn — WIRED to requestTurn) ─────────────────────────────────
test("trigger_turn dispatches requestTurn with the author/chat/depth + rendered guided steer", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host }); // origin.automationDepth = 1
  const speaker = mintTypeId(ID_PREFIX.character);
  const action: AutomationActionInput = { type: "trigger_turn", speakerCharacterId: speaker, guidedTemplate: "steer-{{roll:1}}" };

  const outcome = await dispatch(arm(action), frame);

  expect(outcome).toEqual({ ok: true });
  expect(captured.turns).toHaveLength(1);
  // The funder = the rule AUTHOR (→ triggeredBy); the cascade depth is the origin CHILD-depth; the steer is
  // macro-rendered (the arm renders `guidedTemplate` before the op). initiator is fixed at compose (not here).
  expect(captured.turns[0]).toEqual({ authorUserId: host, chatId, automationDepth: 1, speakerCharacterId: speaker, guided: "steer-1" });
});

test("trigger_turn with no steer / no forced speaker omits both fields (normal arbitration)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host });

  const outcome = await dispatch(arm({ type: "trigger_turn" }), frame);

  expect(outcome).toEqual({ ok: true });
  expect(captured.turns[0]).toEqual({ authorUserId: host, chatId, automationDepth: 1 });
});

test("trigger_turn maps a requestTurn refusal (consent/authority/depth throw) to a typed arm_error, no fabricated success", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, {
    turn: { throws: new Error("a non-owner-triggered max-pro-sub turn requires explicit owner consent") },
  });
  const frame = makeFrame({ chatId, authorUserId: host });

  const outcome = await dispatch(arm({ type: "trigger_turn" }), frame);

  expect(outcome).toMatchObject({ ok: false, kind: "arm_error" });
  expect(captured.turns).toHaveLength(0);
});

// ── the v1-unwired transform_draft arm is a TYPED REFUSAL at the dispatch engine ───────────────
test("transform_draft is a typed arm_error refusal (no op)", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db);
  const frame = makeFrame({ chatId, authorUserId: host });

  const transform = await dispatch({ type: "transform_draft", target: "user_input", template: "x" }, frame);
  expect(transform).toMatchObject({ ok: false, kind: "arm_error" });

  // No live effect from the refusal.
  expect(captured).toEqual({ varOps: [], upserts: [], notifications: [], images: [], bus: [], setBackgrounds: [], quietPrompts: [], turns: [] });
});

// ── 1.8 set_chat_background (BG-F — the /autobg quiet-pick engine) ─────────────────────────────────────
const BG_ALICE: ThemeBackground = {
  kind: "asset",
  externalUrl: "",
  assetId: "asset_dawn",
  assetHash: "hash_dawn",
  mime: "image/png",
  provenanceUrl: "",
};
const BG_BOB: ThemeBackground = {
  kind: "asset",
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
  const { dispatch, captured } = makeHarness(db, { bg: { choices: AUTOBG_CHOICES, quietReply: "Dusk Harbor" } });

  const outcome = await dispatch(arm({ type: "set_chat_background" }), makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toEqual({ ok: true });
  // The quiet op (the mint) got a prompt listing the real candidate names.
  expect(captured.quietPrompts).toHaveLength(1);
  expect(captured.quietPrompts[0]).toContain("Dawn Meadow");
  expect(captured.quietPrompts[0]).toContain("Dusk Harbor");
  // The model's pick matched a choice and was written as the chat background (host-scoped, author = host).
  expect(captured.setBackgrounds).toEqual([{ authorUserId: host, chatId, background: BG_BOB }]);
});

// PROSE-1 census 91 — the pick's task lead + reply contract are per-USER slots resolved against the ROOM HOST.
test("set_chat_background: the quiet pick frames the candidates with the shipped prose clauses", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, { bg: { choices: AUTOBG_CHOICES, quietReply: "Dusk Harbor" } });
  await dispatch(arm({ type: "set_chat_background" }), makeFrame({ chatId, authorUserId: host }));
  expect(captured.quietPrompts[0]?.startsWith(`${PROSE_SLOTS["automation.autobg.task"].text}\n\n`)).toBe(true);
  expect(captured.quietPrompts[0]?.endsWith(`\n\n${PROSE_SLOTS["automation.autobg.reply"].text}`)).toBe(true);
});

test("set_chat_background: a host's prose overrides REPLACE both clauses, keeping the candidate frame", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, {
    bg: {
      choices: AUTOBG_CHOICES,
      quietReply: "Dusk Harbor",
      prose: {
        "automation.autobg.task": { text: "PICK A MOOD.", baseVersion: 1 },
        "automation.autobg.reply": { text: "NAME ONLY.", baseVersion: 1 },
      },
    },
  });
  await dispatch(arm({ type: "set_chat_background" }), makeFrame({ chatId, authorUserId: host }));
  expect(captured.quietPrompts[0]?.startsWith("PICK A MOOD.\n\n")).toBe(true);
  expect(captured.quietPrompts[0]?.endsWith("\n\nNAME ONLY.")).toBe(true);
  expect(captured.quietPrompts[0]).toContain("Available backgrounds: Dawn Meadow, Dusk Harbor");
});

test("set_chat_background: the name match is case/space-insensitive", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, { bg: { choices: AUTOBG_CHOICES, quietReply: "  dawn meadow  " } });
  await dispatch(arm({ type: "set_chat_background" }), makeFrame({ chatId, authorUserId: host }));
  expect(captured.setBackgrounds).toEqual([{ authorUserId: host, chatId, background: BG_ALICE }]);
});

test("set_chat_background: a host-authority refusal from the write is a typed arm_error, never a raw rejection (DEF-11 race)", async () => {
  const { db, host, chatId } = await setup();
  // The author lost host authority between the pre-dispatch gate and the write (a host-handoff race), so the
  // verb refuses. The arm must surface a typed arm_error (the rule stays healthy), never let the rejection escape.
  const { dispatch, captured } = makeHarness(db, {
    bg: { choices: AUTOBG_CHOICES, quietReply: "Dusk Harbor", setChatBackgroundThrows: new Error("chat: not_host") },
  });

  const outcome = await dispatch(arm({ type: "set_chat_background" }), makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toEqual({ ok: false, kind: "arm_error", detail: expect.stringContaining("not_host") });
  expect(captured.setBackgrounds).toEqual([]);
});

test("set_chat_background: an empty library is a soft no-op — no quiet call, no write", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, { bg: { choices: [], quietReply: "anything" } });
  const outcome = await dispatch(arm({ type: "set_chat_background" }), makeFrame({ chatId, authorUserId: host }));
  expect(outcome).toEqual({ ok: true });
  expect(captured.quietPrompts).toEqual([]);
  expect(captured.setBackgrounds).toEqual([]);
});

test("set_chat_background: an off-list / empty quiet reply is a soft no-op — no write, rule stays healthy", async () => {
  const { db, host, chatId } = await setup();
  const { dispatch, captured } = makeHarness(db, { bg: { choices: AUTOBG_CHOICES, quietReply: "Some Other Place" } });
  const outcome = await dispatch(arm({ type: "set_chat_background" }), makeFrame({ chatId, authorUserId: host }));
  expect(outcome).toEqual({ ok: true });
  expect(captured.quietPrompts).toHaveLength(1);
  expect(captured.setBackgrounds).toEqual([]);
});

// ── 1.9 run_tool (D146 — the CONTRIBUTOR bridge arm) ─────────────────────────────────────────────────
// The arm's own behaviour: render → invoke → route the outcome. The RULE-level pause gate (which refuses
// before any arm runs) is pinned at the dispatch engine (`handle-event.int.test.ts`); what these pin is the
// arm's half — including the DEACTIVATED-MID-DISPATCH race, which is the only way an arm-level pause happens.

/** A tool seam that answers for exactly `name` and nothing else, recording what it was handed. */
function toolsThatRun(name: string, result: string, sink: AutomationToolRequest[]): AutomationOps["tools"] {
  return {
    isToolDrivableBy: (toolName): boolean => toolName === name,
    runTool: (req): Promise<AutomationToolOutcome> => {
      sink.push(req);
      return Promise.resolve({ ok: true, result });
    },
  };
}

test("run_tool renders its argsTemplate in the author's env and hands the tool the RENDERED json", async () => {
  const { db, host, chatId } = await setup();
  const sink: AutomationToolRequest[] = [];
  const { dispatch } = makeHarness(db, { tools: toolsThatRun("plugin_x_report", '{"mood":"grim"}', sink) });

  const outcome = await dispatch(
    arm({ type: "run_tool", name: "plugin_x_report", argsTemplate: '{"seed":{{roll:1}},"mood":"{{expr::vars.mood}}"}' }),
    makeFrame({ chatId, authorUserId: host, vars: { mood: "grim" } }),
  );

  expect(outcome).toEqual({ ok: true });
  // The tool never sees a template: the arm renders ONCE, at fire time, in the RULE AUTHOR's env — the same
  // discipline every other templated arm follows, and the reason a tool cannot be handed macro syntax to run.
  expect(sink).toEqual([{ authorUserId: host, chatId, name: "plugin_x_report", argsJson: '{"seed":1,"mood":"grim"}' }]);
});

test("run_tool captures its result into resultVar and WRITES THROUGH the shared env (a later arm reads it)", async () => {
  const { db, host, chatId } = await setup();
  const sink: AutomationToolRequest[] = [];
  const { dispatch, captured } = makeHarness(db, { tools: toolsThatRun("plugin_x_report", "tense", sink) });
  const frame = makeFrame({ chatId, authorUserId: host });

  await dispatch(arm({ type: "run_tool", name: "plugin_x_report", resultVar: "mood" }), frame);

  expect(captured.varOps).toEqual([{ chatId, ops: [{ op: "set", key: "mood", value: "tense" }] }]);
  // The write-through is what makes "order is semantics" true for this arm too: the DB write alone would be
  // invisible to the next arm and to every later rule in the same batch (the env is built once per batch).
  expect(frame.env.vars["mood"]).toBe("tense");
});

test("run_tool TRUNCATES a captured result at the variable plane's cap — a guest cannot bloat the CEL env", async () => {
  const { db, host, chatId } = await setup();
  const sink: AutomationToolRequest[] = [];
  const huge = "z".repeat(AUTOMATION_VARIABLE_VALUE_MAX + 500);
  const { dispatch, captured } = makeHarness(db, { tools: toolsThatRun("plugin_x_report", huge, sink) });
  const frame = makeFrame({ chatId, authorUserId: host });

  const outcome = await dispatch(arm({ type: "run_tool", name: "plugin_x_report", resultVar: "blob" }), frame);

  // The invocation SUCCEEDED — the tool ran and answered, so failing the rule over a long answer would be a
  // lie about what happened. What is bounded is what lands in the plane every later predicate reads.
  expect(outcome).toEqual({ ok: true });
  expect(captured.varOps[0]?.ops[0]).toEqual({ op: "set", key: "blob", value: "z".repeat(AUTOMATION_VARIABLE_VALUE_MAX) });
  // The SHARED env carries the same truncated value — a later predicate reads the bound, not the guest's blob.
  const mirrored: string | undefined = frame.env.vars["blob"];
  expect(mirrored).toHaveLength(AUTOMATION_VARIABLE_VALUE_MAX);
});

test("run_tool with no resultVar captures NOTHING (the result rides the fire log only — never prose)", async () => {
  const { db, host, chatId } = await setup();
  const sink: AutomationToolRequest[] = [];
  const { dispatch, captured } = makeHarness(db, { tools: toolsThatRun("plugin_x_report", "secret", sink) });

  const outcome = await dispatch(arm({ type: "run_tool", name: "plugin_x_report" }), makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toEqual({ ok: true });
  // THE CLASS-1 WALL, pinned as an absence: a tool result is DATA back to the arm. There is no message write on
  // this surface, so an uncaptured result reaches nothing at all — not the room, not the canon, not a variant.
  expect(captured.varOps).toEqual([]);
});

test("run_tool: a tool FAILURE is an arm_error (a fault the error budget should eventually stop)", async () => {
  const { db, host, chatId } = await setup();
  const tools: AutomationOps["tools"] = {
    isToolDrivableBy: () => true,
    runTool: () => Promise.resolve({ ok: false, reason: "failed", error: "the guest refused: bad tag" }),
  };
  const { dispatch } = makeHarness(db, { tools });

  const outcome = await dispatch(arm({ type: "run_tool", name: "plugin_x_report" }), makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toMatchObject({ ok: false, kind: "arm_error" });
  expect(outcome).toMatchObject({ detail: expect.stringContaining("bad tag") });
});

test("run_tool: an UNAVAILABLE tool PAUSES the arm — never an arm_error (D146-d, the deactivate-mid-dispatch race)", async () => {
  const { db, host, chatId } = await setup();
  // The rule-level gate said the tool was there; the plugin was deactivated in the window before this call.
  // The race must NOT be charged to the rule: `arm_error` increments `consecutive_errors` and auto-disables at
  // 20, so a plugin toggled at the wrong moment would nibble the budget of every rule naming its tools.
  const tools: AutomationOps["tools"] = {
    isToolDrivableBy: () => false,
    runTool: () => Promise.resolve({ ok: false, reason: "unavailable" }),
  };
  const { dispatch } = makeHarness(db, { tools });

  const outcome = await dispatch(arm({ type: "run_tool", name: "plugin_x_report" }), makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toMatchObject({ ok: false, kind: "paused" });
  // The CONTROL that keeps the assertion from passing vacuously: the two non-ok kinds are genuinely distinct,
  // and only ONE of them is the kind the dispatch engine turns into an error tick.
  expect(outcome).not.toMatchObject({ kind: "arm_error" });
});

test("run_tool: a template render error refuses BEFORE the tool is invoked", async () => {
  const { db, host, chatId } = await setup();
  const sink: AutomationToolRequest[] = [];
  const { dispatch } = makeHarness(db, { tools: toolsThatRun("plugin_x_report", "ok", sink) });

  // `{{roll}}` with no arg is a strict-args error (02 §5) — an unrendered template must never reach a guest.
  const outcome = await dispatch(arm({ type: "run_tool", name: "plugin_x_report", argsTemplate: '{"n":{{roll}}}' }), makeFrame({ chatId, authorUserId: host }));

  expect(outcome).toMatchObject({ ok: false, kind: "arm_error" });
  expect(sink).toEqual([]);
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
        // @orb-waive no-test-fabrication(unknown): a deliberately field-less action — the probe only tests the discriminant ROUTES to a case (not `default: never`); the arm may refuse/crash on the missing fields. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
        await dispatch({ type } as unknown as AutomationAction, frame);
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
  const action: Extract<AutomationActionInput, { type: "set_variable" }> = { type: "set_variable", scope: "chat", key: "k", op: "set", value: "{{roll}}" };
  const outcome = await dispatch(arm(action), makeFrame({ chatId, authorUserId: host }));
  expect(outcome?.ok).toBe(false);
  expect(captured.varOps).toHaveLength(0);
});
