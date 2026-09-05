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
import { automationRuleState, automationRules, chatBooks, messages, worldBooks } from "@orb/db";
import type { AutomationRuleId, ChatId, MessageId, MessageVariantId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { ZWSP } from "@orb/kit/macro";
import { sha256Hex } from "@orb/server/kit/content-hash";
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
import { advanceSettledWatermark, selectRuleState, upsertRuleState } from "../../../../../packages/server/src/domain/automation/persistence/rule-state.ts";
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

/** The harness: real db reads (windows/state/attach), captured writes, and a CANNED model reply.
 *  `throwOnVarOps` makes the LAST effecting route blow up — the only way to exercise a failure that lands
 *  AFTER the durable lore write has already committed (#1418). `duringModelCall` runs INSIDE the quiet call,
 *  which is the one window a concurrent host action can land in mid-pass (#1543). */
function makeHarness(
  db: Db,
  quietReplies: readonly string[],
  opts: { readonly throwOnVarOps?: boolean; readonly duringModelCall?: () => Promise<void> } = {},
): { dispatch: ArmDispatch; captured: Captured; suggestions: SuggestionStore } {
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
        return opts.throwOnVarOps === true ? Promise.reject(new Error("variable write exploded")) : Promise.resolve({ outcome: "applied" });
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
    summarizeQuiet: async ({ systemPrompt, prompt, posture, responseFormat }) => {
      captured.quiet.push({ systemPrompt, prompt, posture, schemaName: responseFormat?.name ?? null });
      await opts.duringModelCall?.();
      return { text: replies.shift() ?? "" };
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
        audited: null,
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

// #1564 — the vars route mirrors onto the SHARED env under the same write-through law the `set_variable` arm
// obeys, so it needs the same own-key writer: a route key of `__proto__` written with property syntax hits
// `Object.prototype`'s inherited setter and lands nowhere, leaving the durable write and the in-memory plane
// disagreeing for every later arm and rule in the batch.
test("NEEDLE (route authored): a __proto__ route key lands as an OWN key on the shared env, not nowhere", async () => {
  const { db, host, chatId, ruleId } = await setup(2);
  const { dispatch, captured } = makeHarness(db, [reply({ ...EMPTY_PLOT, score: 4 })]);
  const frame = makeFrame({ chatId, authorUserId: host, ruleId });

  const outcome = await dispatch(arm({ type: "run_analysis", brief: "b", routes: { vars: { key: "__proto__" } } }), frame);

  expect(outcome).toEqual({ ok: true });
  expect(captured.varOps).toEqual([{ chatId, ops: [{ op: "set", key: "__proto__", value: "4" }] }]);
  expect(Object.hasOwn(frame.env.vars, "__proto__")).toBe(true);
  expect(frame.env.vars["__proto__"]).toBe("4");
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

test("#1418 — a route that fails AFTER the lore commit still leaves the span COVERED (no divergent re-distillation)", async () => {
  const { db, host, chatId, ruleId } = await setup(LORE_CHAT_MESSAGES);
  const bookId = await seedBook(db, host, chatId, true);
  // Direct lore + a vars route whose write EXPLODES. The lore bytes are already in the book by then; the
  // pass dies afterwards. If the coverage record waits for the end of the pass, the next pass re-reads the
  // same span, asks the model again, and lands a second, differently-keyed set of entries beside the first.
  const { dispatch, captured } = makeHarness(
    db,
    [reply({ ...EMPTY_PLOT, lore: [{ key: "the-courier", keys: ["courier"], content: "The courier vanished." }], score: 5 })],
    { throwOnVarOps: true },
  );
  await expect(
    dispatch(
      arm({ type: "run_analysis", brief: "b", routes: { lore: { apply: "direct", bookId }, vars: { key: "tension" } } }),
      makeFrame({ chatId, authorUserId: host, ruleId }),
    ),
  ).rejects.toThrow("variable write exploded");

  expect(captured.upserts).toHaveLength(1); // the durable write DID land — it cannot be un-landed.
  // …so its span is recorded. The pass's CONCLUSIONS are not: the arc bank stays as it was.
  const after = await selectRuleState(db, ruleId);
  expect(after.state.settledThroughSeq).toBe(LORE_SPAN_END);
  expect(after.state.arc).toBe("");
});

test("#1543 — a CONFIRM landing mid-pass is not reverted by the end-of-pass write (the mark is monotonic)", async () => {
  const { db, host, chatId, ruleId } = await setup(LORE_CHAT_MESSAGES);
  const bookId = await seedBook(db, host, chatId, true);
  // The interleaving, at the one point a real one can happen: the pass reads the mark at step 2, then WAITS
  // on the model. A host confirming a lore card in that window advances the mark through
  // `advanceSettledWatermark`; the pass then wrote its own blob back and silently un-covered that span, so
  // the next pass re-distilled play the host had already accepted. Driven from the summarizeQuiet double
  // because that IS the in-flight moment.
  const confirmedThrough = 11;
  const { dispatch } = makeHarness(db, [reply({ ...EMPTY_PLOT, lore: [] })], {
    duringModelCall: () => advanceSettledWatermark(db, { ruleId, throughSeq: confirmedThrough, nowMs: FIXED_NOW_MS }),
  });
  const outcome = await dispatch(
    arm({ type: "run_analysis", brief: "b", routes: { lore: { apply: "direct", bookId } } }),
    makeFrame({ chatId, authorUserId: host, ruleId }),
  );
  expect(outcome).toEqual({ ok: true });
  // This pass's own coverage ends at seq 4 (LORE_SPAN_END); the confirm's reaches 11 and must WIN.
  expect((await selectRuleState(db, ruleId)).state.settledThroughSeq).toBe(confirmedThrough);
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

// ── C3: the prose-audit (rewrite) route ──────────────────────────────────────────────────────────────
// The audited reply in `setup(N)` is always the highest-seq ASSISTANT row — with an even N that is seq N,
// content `beat N`, so the pins below can name its bytes exactly.

/** The audited row's ids as `seedMessage` mints them (castId, not minted — the seeder's own convention). */
function auditedIds(chatId: ChatId, seq: number): { messageId: MessageId; variantId: MessageVariantId } {
  return { messageId: castId<MessageId>(`message_${chatId}_${seq}`), variantId: castId<MessageVariantId>(`variant_${chatId}_${seq}_0`) };
}

test("rewrite: a FLAWED verdict raises ONE card pinned to the audited variant and hashed over its exact bytes", async () => {
  const { db, host, chatId, ruleId } = await setup(4);
  const { dispatch, captured, suggestions } = makeHarness(db, [
    reply({ ...EMPTY_PLOT, rewrite: { verdict: "flawed", issue: "repeats itself", text: "Beat four, said once." } }),
  ]);
  const outcome = await dispatch(arm({ type: "run_analysis", brief: "b", routes: { rewrite: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome).toEqual({ ok: true, suggested: true });

  const ids = auditedIds(chatId, 4);
  const pending = suggestions.listForChat(chatId, FIXED_NOW_MS)[0];
  expect(pending?.payload).toEqual({
    via: "analysis",
    act: {
      kind: "rewrite",
      messageId: ids.messageId,
      variantId: ids.variantId,
      // The hash is over the AUDITED bytes, not the rewrite's — it is the staleness pin, and computing it
      // over the wrong side is exactly the mistake that would make every confirm pass.
      contentHash: sha256Hex("beat 4"),
      content: "Beat four, said once.",
    },
  });
  // The card's own body: the host sees the diff, not just the question.
  const raised = captured.bus.find((e) => e.type === "suggestionRaised");
  expect(raised).toMatchObject({ kind: "confirm", summary: "Fix the last reply — repeats itself?", detail: { kind: "rewrite", before: "beat 4" } });
});

test("rewrite: a CLEAN verdict draws NOTHING — no card, no bus event, and the pass still reports ok", async () => {
  const { db, host, chatId, ruleId } = await setup(4);
  const { dispatch, captured, suggestions } = makeHarness(db, [reply({ ...EMPTY_PLOT, rewrite: { verdict: "clean", issue: "", text: "" } })]);
  const outcome = await dispatch(arm({ type: "run_analysis", brief: "b", routes: { rewrite: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  // `ok` WITHOUT `suggested` is the clean verdict on the wire: the dispatch turns `suggested` into the
  // `suggested` run terminal and a bare `ok` into `fired`, which is what makes R7's synchronous answer able
  // to say "it ran and found nothing" rather than going silent (§7 C3's clean-verdict criterion).
  expect(outcome).toEqual({ ok: true });
  expect(suggestions.listForChat(chatId, FIXED_NOW_MS)).toEqual([]);
  expect(captured.bus.filter((e) => e.type === "suggestionRaised")).toEqual([]);
});

test("rewrite: a FLAWED verdict that reproduces the reply verbatim is treated as clean — a no-op card is worse than none", async () => {
  const { db, host, chatId, ruleId } = await setup(4);
  const { dispatch, suggestions } = makeHarness(db, [reply({ ...EMPTY_PLOT, rewrite: { verdict: "flawed", issue: "hmm", text: "beat 4" } })]);
  const outcome = await dispatch(arm({ type: "run_analysis", brief: "b", routes: { rewrite: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome).toEqual({ ok: true });
  expect(suggestions.listForChat(chatId, FIXED_NOW_MS)).toEqual([]);
});

test("rewrite: the model's bytes are NEUTRALIZED at the stash (law 7) — a rewrite can never carry live macro syntax into a message row", async () => {
  const { db, host, chatId, ruleId } = await setup(4);
  const { dispatch, suggestions } = makeHarness(db, [
    reply({ ...EMPTY_PLOT, rewrite: { verdict: "flawed", issue: "i", text: "She said {{getglobalvar::secret}} again." } }),
  ]);
  await dispatch(arm({ type: "run_analysis", brief: "b", routes: { rewrite: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  const pending = suggestions.listForChat(chatId, FIXED_NOW_MS)[0];
  const act = pending?.payload?.via === "analysis" ? pending.payload.act : null;
  expect(act?.kind === "rewrite" ? act.content : "").toContain(`{${ZWSP}{getglobalvar::secret}${ZWSP}}`);
});

test("rewrite: with NO auditable reply the route leaves the schema AND the prompt — the model is never asked", async () => {
  // A room with only USER rows has nothing a prose audit could be about.
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedChat(db, "noaudit");
  await seedParticipant(db, { chatId, key: "noaudit_host", userId: host, role: "host" });
  const ruleId = castId<AutomationRuleId>("automation_rule_noaudit");
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
  await seedMessage(db, chatId, 1, { role: "user", content: "hello" });
  const { dispatch, captured, suggestions } = makeHarness(db, [reply(EMPTY_PLOT)]);
  const outcome = await dispatch(arm({ type: "run_analysis", brief: "b", routes: { rewrite: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  expect(outcome).toEqual({ ok: true });
  expect(captured.quiet[0]?.systemPrompt).not.toContain("AUDITED REPLY");
  expect(captured.quiet[0]?.prompt).not.toContain("AUDITED REPLY");
  expect(suggestions.listForChat(chatId, FIXED_NOW_MS)).toEqual([]);
});

test("rewrite: a HIDDEN reply is not auditable — the host already shelved it", async () => {
  const { db, host, chatId, ruleId } = await setup(4);
  await db
    .update(messages)
    .set({ excludedFromPrompt: true })
    .where(eq(messages.id, auditedIds(chatId, 4).messageId));
  const { dispatch, suggestions } = makeHarness(db, [reply({ ...EMPTY_PLOT, rewrite: { verdict: "flawed", issue: "i", text: "fixed" } })]);
  await dispatch(arm({ type: "run_analysis", brief: "b", routes: { rewrite: {} } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  // seq 2 is the next-newest assistant row, so the audit falls back to it rather than to nothing — and the
  // pin is that it never names the hidden row.
  const pending = suggestions.listForChat(chatId, FIXED_NOW_MS)[0];
  const act = pending?.payload?.via === "analysis" ? pending.payload.act : null;
  expect(act?.kind === "rewrite" ? act.messageId : "").toBe(auditedIds(chatId, 2).messageId);
});

// ── #1416: the settled slice is a CURSOR on a warm pass, and the legacy freshest-slice posture on a cold one ──

/** Enough canon that the settled span outgrows `ANALYSIS_SETTLED_SLICE_MAX` (300): maxSeq 340, protect tail
 *  16 ⇒ `through` = 324, and a warm pass resuming from seq 1 has a 323-row span to cover. */
const SLICE_CHAT_MESSAGES = 340;
const SLICE_THROUGH = SLICE_CHAT_MESSAGES - 16;
const WARM_FROM_SEQ = 1;

/** The SETTLED section of a built pass prompt (`buildAnalysisUserPrompt` labels it, and the FRESH tip is a
 *  separate `\n\n`-joined part that legitimately quotes the newest rows on either arm). */
function settledSection(prompt: string | undefined): string {
  const part = (prompt ?? "").split("\n\n").find((p) => p.startsWith("SETTLED transcript"));
  expect(part).toBeDefined();
  return part ?? "";
}

test("#1416 WARM pass: the over-long settled span is read EARLIEST-first and the watermark advances only to what was READ", async () => {
  const { db, host, chatId, ruleId } = await setup(SLICE_CHAT_MESSAGES);
  const bookId = await seedBook(db, host, chatId, true);
  // A prior pass covered through seq 1 — this is a CURSORED resume, not a cold start. Written through the
  // REAL state writer so the stored blob is byte-identical to what a live pass leaves behind.
  await upsertRuleState(db, { ruleId, state: { ...EMPTY_ANALYSIS_STATE, settledThroughSeq: WARM_FROM_SEQ }, nowMs: FIXED_NOW_MS });
  const { dispatch, captured } = makeHarness(db, [reply({ ...EMPTY_PLOT, lore: [] })]);
  const outcome = await dispatch(
    arm({ type: "run_analysis", brief: "b", routes: { lore: { apply: "direct", bookId } } }),
    makeFrame({ chatId, authorUserId: host, ruleId }),
  );
  expect(outcome).toEqual({ ok: true });

  // The model saw the OLDEST unanalyzed play, not the freshest slice of a span it was about to mark covered.
  // Scoped to the SETTLED section: the fresh tip is a separate window and legitimately quotes the newest rows.
  const settled = settledSection(captured.quiet[0]?.prompt);
  expect(settled).toContain("Narrator: beat 2\n");
  expect(settled).not.toContain(`beat ${SLICE_THROUGH}`);
  // …and the mark stopped where the read stopped: seq 2 through seq 301 is 300 rows.
  expect((await selectRuleState(db, ruleId)).state.settledThroughSeq).toBe(WARM_FROM_SEQ + 300);
});

// GREEN BEFORE THE FIX BY DESIGN — this is the FENCE on the recorded ruling, not a defect proof: it pins
// that the cold arm's behavior is byte-for-byte what it was, so a later "simplification" to one uniform
// slice rule cannot quietly retire the posture `canon-reads.ts` records.
test("#1416 COLD start keeps the recorded freshest-slice posture: newest rows, watermark over the WHOLE span", async () => {
  const { db, host, chatId, ruleId } = await setup(SLICE_CHAT_MESSAGES);
  const bookId = await seedBook(db, host, chatId, true);
  const { dispatch, captured } = makeHarness(db, [reply({ ...EMPTY_PLOT, lore: [] })]);
  await dispatch(arm({ type: "run_analysis", brief: "b", routes: { lore: { apply: "direct", bookId } } }), makeFrame({ chatId, authorUserId: host, ruleId }));
  // No prior mark ⇒ the ruled posture stands: read what is freshest, cover the span (`canon-reads.ts`).
  const settled = settledSection(captured.quiet[0]?.prompt);
  expect(settled).toContain(`beat ${SLICE_THROUGH}`);
  expect(settled).not.toContain("Narrator: beat 2\n");
  expect((await selectRuleState(db, ruleId)).state.settledThroughSeq).toBe(SLICE_THROUGH);
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
