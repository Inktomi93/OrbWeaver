// .int tests for the S5 `run_analysis` executor (engine/analysis-arm), driven through the REAL `runArm`
// dispatcher (the switch wiring is under test too, never a hand-called internal). Real libSQL: the windows
// read seeded canon (selected-variant join), the state row round-trips `automation_rule_state`, and the
// lore belts probe a real `chat_books` attachment. The model lane is the captured `summarizeQuiet` double
// returning CANNED JSON — every test states what the "model" said, so what the EXECUTOR did with it is the
// only variable.
//
// The load-bearing pins, each naming its law:
//   • the GOLDEN prompt build (fixture transcript + state → exact bytes; done-criterion);
//   • guidance stored VERBATIM — macro braces intact, never rendered, never neutralized (§2 law 6);
//   • the NEEDLE wall at the parse/apply level (model-independent): a `score` against a no-vars-route
//     config strips at the zod and applyVariableOps is NEVER called; an authored route crosses ONLY the
//     clamped integer (§8b of the C1 design — the security re-read's receipt);
//   • the lore belts BITE on the analysis path (the planted control the orchestrator made a
//     done-criterion): an unattached book ⇒ arm_error + zero writes + NO state write;
//   • span-stamped keys + neutralized content on the durable route (law 7) + the watermark advancing ONLY
//     on a successful direct apply — a confirm RAISE leaves it unmoved (§3-S5.5 retryability).

import type { AutomationBusEvent, AutomationCelEnv, TriggerFact } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationRuleState, automationRules, chatBooks, worldBooks } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { ZWSP } from "@orb/kit/macro";
import { eq } from "drizzle-orm";
import { EMPTY_ANALYSIS_STATE } from "../../../../../packages/server/src/domain/automation/contract/analysis.ts";
import type {
  ArmDispatch,
  AutomationOps,
  AutomationTurnRequest,
  PendingSuggestion,
  SuggestionStore,
} from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import { buildAnalysisSystemPrompt, buildAnalysisUserPrompt } from "../../../../../packages/server/src/domain/automation/engine/analysis-arm.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { selectRuleState } from "../../../../../packages/server/src/domain/automation/persistence/rule-state.ts";
import { createSuggestionStore } from "../../../../../packages/server/src/domain/automation/substrate/suggestions.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedMessage, seedParticipant } from "../../chat/_support.ts";
import { arm, NO_TOOLS, seedUser } from "../_support.ts";

const FIXED_NOW_MS = 1_700_000_000_000;
const FIXED_PRNG = (): number => 0.42;

/** What the captured ops recorded. */
interface Captured {
  readonly varOps: { chatId: ChatId; ops: readonly VarOp[] }[];
  readonly upserts: { authorUserId: UserId; bookId: WorldBookId; entries: readonly { title: string; keys: readonly string[]; content: string }[] }[];
  readonly turns: AutomationTurnRequest[];
  readonly quiet: { systemPrompt: string; prompt: string; posture: string; schemaName: string | null }[];
  readonly bus: AutomationBusEvent[];
}

/** The harness: real db reads (windows/state/attach), captured writes, and a CANNED model reply. */
function makeHarness(db: Db, quietReplies: readonly string[]): { dispatch: ArmDispatch; captured: Captured; suggestions: SuggestionStore } {
  const captured: Captured = { varOps: [], upserts: [], turns: [], quiet: [], bus: [] };
  const replies = [...quietReplies];
  const ops: AutomationOps = {
    tools: NO_TOOLS,
    chat: {
      getMessageFact: () => Promise.resolve(null),
      getTurnOrigin: () => Promise.resolve(null),
      resolveViewerVisibility: () => Promise.resolve(null),
      readVariables: () => Promise.resolve({}),
      readChoicePicks: () => Promise.resolve({}),
      resolveChatProse: () => Promise.resolve({}),
      applyVariableOps: (chatId, varOps) => {
        captured.varOps.push({ chatId, ops: varOps });
        return Promise.resolve();
      },
      listBackgroundChoices: () => Promise.resolve([]),
      setChatBackground: () => Promise.resolve(),
      requestTurn: (req) => {
        captured.turns.push(req);
        return Promise.resolve({ messageCount: 1 });
      },
    },
    worldInfo: {
      upsertEntries: (args) => {
        captured.upserts.push(args);
        return Promise.resolve({ inserted: args.entries.length, updated: 0, skippedHandEdited: 0 });
      },
    },
    notifications: { emit: () => Promise.resolve() },
    imagery: { generatePicture: () => Promise.resolve({ imageCount: 0 }) },
    summarizeQuiet: ({ systemPrompt, prompt, posture, responseFormat }) => {
      captured.quiet.push({ systemPrompt, prompt, posture, schemaName: responseFormat?.name ?? null });
      return Promise.resolve({ text: replies.shift() ?? "" });
    },
  };
  const suggestions = createSuggestionStore();
  const dispatch = createArmExecutors({
    db,
    ops,
    prng: FIXED_PRNG,
    notify: (event) => captured.bus.push(event),
    suggestions,
    newSuggestionId: () => mintTypeId(ID_PREFIX.automationSuggestion),
  });
  return { dispatch, captured, suggestions };
}

function makeFrame(args: { chatId: ChatId; authorUserId: UserId; ruleId: AutomationRuleId }): Parameters<ArmDispatch>[1] {
  const env: AutomationCelEnv = {
    vars: {},
    choice: {},
    global: {},
    chat: { id: args.chatId, messageCount: 0 },
    now: { epochMs: FIXED_NOW_MS, hour: 22, dayOfWeek: 2 },
  };
  const fact: TriggerFact = { type: "turnCompleted", bus: "chat", chatId: args.chatId };
  return { chatId: args.chatId, authorUserId: args.authorUserId, fact, env, origin: { ruleId: args.ruleId, automationDepth: 1 }, now: FIXED_NOW_MS };
}

/** Seed a host + chat + a stored analysis rule row (the state row's FK parent) and N messages. */
async function setup(messageCount: number): Promise<{ db: Db; host: UserId; chatId: ChatId; ruleId: AutomationRuleId }> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedChat(db, "ana");
  await seedParticipant(db, { chatId, key: "ana_host", userId: host, role: "host" });
  const ruleId = castId<AutomationRuleId>("automation_rule_ana");
  await db.insert(automationRules).values({
    id: ruleId,
    ownerId: host,
    chatId,
    name: "analysis",
    position: 1,
    triggerBus: "chat",
    triggerType: "turnCompleted",
    actions: [],
  });
  await Promise.all(
    Array.from({ length: messageCount }, (_, i) =>
      seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 0 ? "assistant" : "user", content: `beat ${i + 1}` }),
    ),
  );
  return { db, host, chatId, ruleId };
}

/** Seed a world book ATTACHED (or not) to the chat. A MINTED TypeID — the arm schema's `bookId` field
 *  validates the suffix, so a hand-spelled short id would refuse at parse, not at the belt under test. */
async function seedBook(db: Db, ownerId: UserId, chatId: ChatId, attach: boolean): Promise<WorldBookId> {
  const bookId = mintTypeId(ID_PREFIX.worldBook);
  await db.insert(worldBooks).values({ id: bookId, ownerId, name: "ana book" });
  if (attach) {
    await db.insert(chatBooks).values({ chatId, worldBookId: bookId });
  }
  return bookId;
}

const EMPTY_PLOT = { arcStatus: "active", updatedArc: null, successorArc: null, twistOps: [] };

function reply(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

// ── the golden prompt build (done-criterion) ─────────────────────────────────────────────────────────

test("GOLDEN: fixture transcript + state build the exact deterministic prompts (system per routes; user per state+windows)", async () => {
  const { db, host, chatId, ruleId } = await setup(3);
  const { dispatch, captured } = makeHarness(db, [reply({ ...EMPTY_PLOT, guidance: "" })]);
  const action = arm({ type: "run_analysis", brief: "Watch the pacing.", steer: "slow burn", routes: { steer: {} } });
  const outcome = await dispatch(action, makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome).toEqual({ ok: true });

  const call = captured.quiet[0];
  expect(call?.posture).toBe("rule_analysis");
  expect(call?.schemaName).toBe("run_analysis");
  // The system contract is composed from the ENABLED routes only — no lore/suggest/vars ask here. `{}`
  // prose = the shipped slot defaults (the same resolution the executor ran — no host override seeded).
  expect(call?.systemPrompt).toBe(buildAnalysisSystemPrompt({ steer: { apply: "direct" } }, {}));
  expect(call?.systemPrompt).toContain("never script what any human character says or does next");
  expect(call?.systemPrompt).not.toContain("SETTLED");
  expect(call?.systemPrompt).not.toContain("narrative tension");
  // The user prompt: brief → steer → cold-start arc line → the fresh window, speaker-labelled, oldest first.
  expect(call?.prompt).toBe(
    [
      "Your task: Watch the pacing.",
      "Host's standing direction (obey it): slow burn",
      "No arc yet — invent the first private arc from the play below.",
      "Recent play:\nPlayer: beat 1\nNarrator: beat 2\nPlayer: beat 3",
    ].join("\n\n"),
  );
  // And the pure builder agrees byte-for-byte (the golden is the BUILDER's, not a copy of the executor's).
  expect(call?.prompt).toBe(
    buildAnalysisUserPrompt(
      {
        brief: "Watch the pacing.",
        steer: "slow burn",
        state: EMPTY_ANALYSIS_STATE,
        fresh: [
          { seq: 1, role: "user", speaker: null, content: "beat 1" },
          { seq: 2, role: "assistant", speaker: null, content: "beat 2" },
          { seq: 3, role: "user", speaker: null, content: "beat 3" },
        ],
        settled: null,
      },
      {},
    ),
  );
});

// ── the steer route (direct) + the verbatim law ──────────────────────────────────────────────────────

test("direct steer: guidance is stored VERBATIM — macro braces intact, no render, no neutralization (§2 law 6)", async () => {
  const { db, host, chatId, ruleId } = await setup(2);
  const guidance = "Plant the courier's absence. {{getglobalvar::secret}} stays literal.";
  const { dispatch } = makeHarness(db, [reply({ ...EMPTY_PLOT, updatedArc: "the debt", twistOps: [{ op: "add", twist: "a clue" }], guidance })]);
  const action = arm({ type: "run_analysis", brief: "b", routes: { steer: {} } });
  const outcome = await dispatch(action, makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome).toEqual({ ok: true });

  const stored = await selectRuleState(db, ruleId);
  expect(stored.guidance).toBe(guidance); // byte-identical: braces intact, NO zero-width space inserted.
  expect(stored.guidance).not.toContain(ZWSP);
  expect(stored.state.arc).toBe("the debt");
  expect(stored.state.twists).toEqual(["a clue"]);
});

test("direct steer: an EMPTY guidance CLEARS the standing guidance (each pass replaces wholesale; empty is the common case)", async () => {
  const { db, host, chatId, ruleId } = await setup(2);
  await db.insert(automationRuleState).values({ ruleId, state: { ...EMPTY_ANALYSIS_STATE }, guidance: "stale steer" });
  const { dispatch } = makeHarness(db, [reply({ ...EMPTY_PLOT, guidance: "" })]);
  const outcome = await dispatch(arm({ type: "run_analysis", brief: "b", routes: { steer: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome).toEqual({ ok: true });
  expect((await selectRuleState(db, ruleId)).guidance).toBe("");
});

// ── the needle wall (§8b — the security re-read's receipts) ──────────────────────────────────────────

test("NEEDLE (route absent): a model-emitted `score` is STRIPPED at the parse and applyVariableOps is NEVER called", async () => {
  const { db, host, chatId, ruleId } = await setup(2);
  // The "model" tries to publish a score AND prose into vars-adjacent fields; the arm has NO vars route.
  const { dispatch, captured } = makeHarness(db, [reply({ ...EMPTY_PLOT, guidance: "g", score: 9 })]);
  const outcome = await dispatch(arm({ type: "run_analysis", brief: "b", routes: { steer: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome).toEqual({ ok: true });
  expect(captured.varOps).toEqual([]); // NOTHING crossed into the member-visible plane.
});

test("NEEDLE (route authored): ONLY the clamped integer score crosses, under the ONE authored key — prose fields never reach vars", async () => {
  const { db, host, chatId, ruleId } = await setup(2);
  const { dispatch, captured } = makeHarness(db, [
    reply({ ...EMPTY_PLOT, updatedArc: "arc prose {{expr::1}}", twistOps: [{ op: "add", twist: "twist prose" }], score: 7.6 }),
  ]);
  const outcome = await dispatch(
    arm({ type: "run_analysis", brief: "b", routes: { vars: { key: "tension" } } }),
    makeFrame({ chatId, authorUserId: host, ruleId }),
  );
  expect(outcome).toEqual({ ok: true });
  expect(captured.varOps).toEqual([{ chatId, ops: [{ op: "set", key: "tension", value: "8" }] }]); // round(7.6), stringified — and nothing else.
});

// ── the lore route: belts, span-stamping, the watermark ──────────────────────────────────────────────

/** 20 messages ⇒ maxSeq 20, protect tail 16 ⇒ the settled span is (0, 4]. */
const LORE_CHAT_MESSAGES = 20;
const LORE_SPAN_END = 4;

test("direct lore: entries are NEUTRALIZED + span-stamped through the ONE belt, and the watermark advances to the span end", async () => {
  const { db, host, chatId, ruleId } = await setup(LORE_CHAT_MESSAGES);
  const bookId = await seedBook(db, host, chatId, true);
  const { dispatch, captured } = makeHarness(db, [
    reply({ ...EMPTY_PLOT, lore: [{ key: "the-courier", keys: ["courier"], content: "The courier vanished. {{setvar::x::1}}" }] }),
  ]);
  const outcome = await dispatch(
    arm({ type: "run_analysis", brief: "b", routes: { lore: { apply: "direct", bookId } } }),
    makeFrame({ chatId, authorUserId: host, ruleId }),
  );
  expect(outcome).toEqual({ ok: true });

  expect(captured.upserts).toHaveLength(1);
  const entry = captured.upserts[0]?.entries[0];
  // Span-stamped, ruleId-namespaced title — the idempotency handle a watermark-unmoved retry overwrites.
  expect(entry?.title).toBe(`auto/${ruleId}:s0.the-courier`);
  // Law 7: the model's macro is NEUTRALIZED at the write boundary (ZWSP between the braces).
  expect(entry?.content).toContain(`{${ZWSP}{setvar::x::1}${ZWSP}}`);
  expect(entry?.content).not.toContain("{{setvar");
  // The watermark advanced to the span end — the C2 idempotency cursor.
  expect((await selectRuleState(db, ruleId)).state.settledThroughSeq).toBe(LORE_SPAN_END);
});

test("PLANTED CONTROL — the belts BITE on the analysis path: an unattached book ⇒ arm_error, ZERO writes, NO state write", async () => {
  const { db, host, chatId, ruleId } = await setup(LORE_CHAT_MESSAGES);
  const bookId = await seedBook(db, host, chatId, false); // NOT attached — the room never consented.
  const { dispatch, captured } = makeHarness(db, [reply({ ...EMPTY_PLOT, lore: [{ key: "k", keys: [], content: "c" }] })]);
  const outcome = await dispatch(
    arm({ type: "run_analysis", brief: "b", routes: { lore: { apply: "direct", bookId } } }),
    makeFrame({ chatId, authorUserId: host, ruleId }),
  );
  expect(outcome).toEqual({ ok: false, kind: "arm_error", detail: `book ${bookId} is not attached to this chat` });
  expect(captured.upserts).toEqual([]);
  // NOTHING durable moved: the state row was never written, so the retry re-covers the whole span.
  expect(await db.select().from(automationRuleState).where(eq(automationRuleState.ruleId, ruleId))).toEqual([]);
});

test("confirm lore: a card is RAISED carrying the resolved entries and the watermark does NOT advance (§3-S5.5 confirm-shaped retryability)", async () => {
  const { db, host, chatId, ruleId } = await setup(LORE_CHAT_MESSAGES);
  const bookId = await seedBook(db, host, chatId, true);
  const { dispatch, captured, suggestions } = makeHarness(db, [reply({ ...EMPTY_PLOT, lore: [{ key: "k1", keys: ["kw"], content: "fact" }] })]);
  const outcome = await dispatch(
    arm({ type: "run_analysis", brief: "b", routes: { lore: { bookId } } }), // apply defaults to CONFIRM for lore
    makeFrame({ chatId, authorUserId: host, ruleId }),
  );
  expect(outcome).toEqual({ ok: true, suggested: true });
  expect(captured.upserts).toEqual([]); // nothing written yet — the host has not said yes.
  expect((await selectRuleState(db, ruleId)).state.settledThroughSeq).toBe(0); // the span stays uncovered.

  const pending: PendingSuggestion | undefined = suggestions.listForChat(chatId, FIXED_NOW_MS)[0];
  expect(pending?.kind).toBe("confirm");
  expect(pending?.actorUserId).toBe(host);
  expect(pending?.payload).toMatchObject({
    via: "analysis",
    act: { kind: "lore", bookId, spanEnd: LORE_SPAN_END, entries: [{ entryKey: "s0.k1", keys: ["kw"], content: "fact" }] },
  });
  const raised = captured.bus.find((e) => e.type === "suggestionRaised");
  expect(raised).toMatchObject({ type: "suggestionRaised", chatId, kind: "confirm" });
});

// ── the suggest route ────────────────────────────────────────────────────────────────────────────────

test("suggest: ONE card carrying a NEUTRALIZED suggestTurn act at the raising dispatch's child depth", async () => {
  const { db, host, chatId, ruleId } = await setup(2);
  const { dispatch, suggestions } = makeHarness(db, [reply({ ...EMPTY_PLOT, suggestions: [{ text: "Cut to the chase {{roll::d20}}" }] })]);
  const outcome = await dispatch(arm({ type: "run_analysis", brief: "b", routes: { suggest: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome).toEqual({ ok: true, suggested: true });
  const pending = suggestions.listForChat(chatId, FIXED_NOW_MS)[0];
  expect(pending?.payload).toMatchObject({ via: "analysis", act: { kind: "suggestTurn", automationDepth: 1 } });
  const act = pending?.payload?.via === "analysis" ? pending.payload.act : null;
  expect(act?.kind === "suggestTurn" ? act.steerText : "").toContain(`{${ZWSP}{roll::d20}${ZWSP}}`);
});

// ── failure honesty ──────────────────────────────────────────────────────────────────────────────────

test("a pass whose model output never validates is a typed arm_error (one bounded retry) with NO state write", async () => {
  const { db, host, chatId, ruleId } = await setup(2);
  const { dispatch, captured } = makeHarness(db, ["not json at all", "still not json"]);
  const outcome = await dispatch(arm({ type: "run_analysis", brief: "b", routes: { steer: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome).toMatchObject({ ok: false, kind: "arm_error" });
  expect(captured.quiet).toHaveLength(2); // exactly one bounded retry, never a loop.
  expect(await db.select().from(automationRuleState).where(eq(automationRuleState.ruleId, ruleId))).toEqual([]);
});
