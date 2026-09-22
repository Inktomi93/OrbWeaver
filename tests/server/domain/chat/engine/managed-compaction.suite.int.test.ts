// The MANAGED-COMPACTION post-turn hook (#9 A): the engine's fire-and-forget `fireManagedCompaction` that
// rebuilds the LINEAR-tier `chats.compactSummary` marker over the span above the fit boundary. `.suite.int` — it
// spans `engine/engine.ts` (the API-axis gate + trigger + single-flight) + the REAL `runCompaction` core
// (verbs/compaction.ts) + the REAL `quietGenerate` seam (verbs/quiet-generate.ts, its `runChatTurn` stubbed),
// wired the composition-root way against a real libSQL db.
//
// Owner ruling (API-axis gated): compaction GENERATION fires for `connection.api === "agent-sdk"` — the runner
// axis, NEVER a backend/source name. A stateless api (chat-completions) with a blown fit NEVER summarizes. The
// pct trigger reads the CUMULATIVE fit estimate (authoritative on every api — provider tokensIn is a per-turn
// delta on a resuming SDK session, hosted-verified); the fit-drop arm is the reactive backstop. Single-flight; an unchanged
// coverage point never re-fires; a failed/empty generation leaves the marker untouched.

import type { AssembleContext, ChatBusEvent } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_COMPACT_INSTRUCTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { Resolved } from "@orb/inference";
import { generationOf } from "@orb/inference";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initTracing, recentTraces, withRequestSpan } from "@orb/server/foundation/observability";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import type { QuietGenerateParams } from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import type { TurnMessage, TurnPrep, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import { generateDigests } from "../../../../../packages/server/src/domain/chat/memory/build/digests.ts";
import { generateSegments } from "../../../../../packages/server/src/domain/chat/memory/build/segments.ts";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { createCompaction } from "../../../../../packages/server/src/domain/chat/verbs/compaction.ts";
import { createQuietGenerate } from "../../../../../packages/server/src/domain/chat/verbs/quiet-generate.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeCapability } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";
import { makeChatContext, seedChat, seedMessage, seedParticipant, seedUser, testConnection } from "../_support.ts";

const HOST = castId<UserId>("user_host");

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "the user" },
  recentMessages: [],
};

/** An assemble ctx whose ACTIVE PRESET carries the compaction config + context cap in `promptConfig.params` (the
 *  normal UX path — the reviewer's chat), NOT the per-send intent. The trigger must read THIS (folded), not
 *  `prep.intent`. */
function presetCtx(params: Pick<PromptConfig["params"], "compaction" | "maxContextTokens">): AssembleContext {
  return { ...ASSEMBLE_CTX, promptConfig: { ...DEFAULT_PROMPT_CONFIG, params: { ...DEFAULT_PROMPT_CONFIG.params, ...params } } };
}

/** A role turn that yields a fixed reply + economics carrying the given provider usage/window. The tests drive the
 *  REACTIVE fit-drop arm (a tiny maxContextTokens) — the cumulative-usage pct arm reads the fit estimate. */
function turnWithUsage(economics: { tokensIn?: number; tokensOut?: number; contextWindow?: number | null }): ChatContext["runChatTurn"] {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: "Hi" };
      yield { kind: "final", economics: { content: "Hi there", model: testModelId("test-model"), ...economics } };
    })();
}

function prepOf(chatId: ChatId, connection: Resolved<"chat">, over: Partial<TurnPrep>): TurnPrep {
  return {
    chatId,
    assembleContext: ASSEMBLE_CTX,
    connection,
    triggeredBy: HOST,
    funderUserId: HOST,
    runAsUserId: HOST,
    kind: "send",
    intent: { compaction: { mode: "managed" } },
    speakerCharacterId: null,
    ...over,
  };
}

let db: Db;
/** The quiet-generation (marker build) calls the engine hook drove this test. */
let markerCalls: QuietGenerateParams[];

beforeEach(async () => {
  db = await freshDb();
  markerCalls = [];
});

// A UNIQUE chat key per seeded chat: the engine's compaction single-flight Set + the durable `compactedAtSeq`
// are keyed by chatId, and the hook is FIRE-AND-FORGET (can outlive a test's await) — a shared `chat_c` id would
// let one test's in-flight compaction skip the next test's. Distinct ids keep the tests isolated.
let chatSeq = 0;

/** Seed a host chat with `count` aged canon rows so a blown fit ceiling drops the oldest and stamps a boundary. */
async function seedChatWithHistory(count: number): Promise<ChatId> {
  chatSeq += 1;
  const host = await seedUser(db, castId<Handle>("host"));
  const chatId = await seedChat(db, `c${chatSeq}`);
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  for (let seq = 1; seq <= count; seq += 1) {
    await seedMessage(db, chatId, seq, {
      role: seq % 2 === 1 ? "user" : "assistant",
      ...(seq % 2 === 1 ? { authorUserId: host } : {}),
      content: `turn ${seq} — ${"lorem ipsum dolor sit amet ".repeat(8)}`,
    });
  }
  return chatId;
}

/** Pull the single user-text part out of the marker request's history (the span transcript). */
function extractUserText(history: readonly TurnMessage[]): string {
  const part = history.at(0)?.content.at(0);
  return part?.type === "text" ? part.text : "";
}

/** The marker generation's runChatTurn: record the request (as QuietGenerateParams) + yield a fixed marker. Drives
 *  the REAL `createQuietGenerate` seam (only the innermost role call is stubbed). */
const markerRunChatTurn: ChatContext["runChatTurn"] = (req) => {
  markerCalls.push({
    chatId: req.chatId,
    connection: req.connection,
    systemPrompt: req.prompt.static,
    userText: extractUserText(req.history),
    intent: req.intent,
  });
  return (async function* (): AsyncGenerator<TurnStreamChunk> {
    await Promise.resolve();
    yield { kind: "final", economics: { content: "MANAGED MARKER", model: testModelId("stub"), costUsd: 0.001 } };
  })();
};

/** Build the REAL engine with the REAL `runCompaction` + REAL `quietGenerate` wired. The TURN's `runChatTurn`
 *  reports no window so the fit-drop arm drives (a tiny `maxContextTokens` forces drops → a boundary → the
 *  reactive trigger); the MARKER rides `markerRunChatTurn` on a sibling ctx (same db, marker never runs the
 *  turn pipeline). */
function buildEngine(turnRunChatTurn: ChatContext["runChatTurn"] = turnWithUsage({ tokensIn: 4, tokensOut: 2 })): ReturnType<typeof createTurnEngine> {
  const ctx = makeChatContext(db, { runChatTurn: turnRunChatTurn });
  const compactionCtx = makeChatContext(db, { runChatTurn: markerRunChatTurn });
  const { runCompaction } = createCompaction(compactionCtx, {
    emit: () => Promise.resolve(),
    quietGenerate: createQuietGenerate({ runChatTurn: markerRunChatTurn, resolveChatPresetParams: () => Promise.resolve({}) }),
    resolveConnection: () => Promise.resolve(AGENT_SDK),
  });
  return createTurnEngine(ctx, {
    emit: () => Promise.resolve(),

    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments,
    generateDigests,
    loadWitnessHorizons,
    recallMemory,
    runCompaction,
  });
}

const AGENT_SDK = testConnection("vllm", "agent-sdk");
const STATELESS = testConnection("vllm", "chat-completions");
const SMALL_CAP = 200;
const TRACE_SCAN_LIMIT = 50;
const OUTER_REQUEST_ID = "i7-compaction-trace-outer-request";
const COMPACTION_REQUEST_ID_RE = /^compaction-turn:/;

describe("fireManagedCompaction — the managed-compaction post-turn hook (#9 A)", () => {
  test("agent-sdk + fit dropped rows → the marker is rebuilt via the chat's model over the span above the boundary", async () => {
    const chatId = await seedChatWithHistory(8);
    const engine = buildEngine();

    const outcome = await engine.runTurn(prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "managed" }, maxContextTokens: SMALL_CAP } }));
    expect(outcome.aborted).toBe(false);

    await vi.waitFor(async () => {
      const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
      expect(row?.compactSummary).toBe("MANAGED MARKER");
      expect(row?.compactedAtSeq ?? 0).toBeGreaterThan(0);
    });
    // The marker rode the chat's OWN resolved connection (agent-sdk), never a summarizer rail.
    expect(markerCalls.at(0)?.connection.api).toBe("agent-sdk");
  });

  // I-7 finding beyond the three named holes: `fireManagedCompaction` shares the exact outlives-the-request
  // class (fire-and-forget, ran under NO live span) — found alongside them in the same file, fixed in the same
  // lane. Proved through the TRACE RING, driven from inside an outer request root exactly like production.
  test("I-7: the managed-compaction marker build opens its OWN request trace", async () => {
    initTracing();
    const chatId = await seedChatWithHistory(8);
    const engine = buildEngine();

    const outcome = await withRequestSpan(OUTER_REQUEST_ID, "http POST /api/trpc/chat.send", {}, () =>
      engine.runTurn(prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "managed" }, maxContextTokens: SMALL_CAP } })),
    );
    expect(outcome.aborted).toBe(false);

    await vi.waitFor(() => {
      const trace = recentTraces(TRACE_SCAN_LIMIT).find((t) => t.rootName === "chat.managedCompaction");
      expect(trace).toBeDefined();
      expect(trace?.requestId).toMatch(COMPACTION_REQUEST_ID_RE);
      expect(trace?.status).toBe("ok");
      expect(trace?.requestId).not.toBe(OUTER_REQUEST_ID);
    });
  });

  test("ITEM-3 ROOT CAUSE: the ACTIVE PRESET's compaction config + thresholdPct drives the pct-arm fire (NOT a per-send override, NOT a default)", async () => {
    // The reviewer's receipt: a preset set managed + thresholdPct 0.5, the chat sat at 56.9% of the window, and
    // compaction NEVER fired — because the trigger read `prep.intent` (empty per-send) instead of the folded
    // effective config (preset params). The fix: the trigger reads the EFFECTIVE compaction (preset ⊕ intent).
    const chatId = await seedChatWithHistory(16); // ~640 canon tokens ≥ 0.5 × 400 preset cap ⇒ over the preset threshold
    const engine = buildEngine();

    // NO per-send compaction/cap — the config lives ENTIRELY on the active preset (promptConfig.params).
    const outcome = await engine.runTurn(
      prepOf(chatId, AGENT_SDK, {
        intent: {}, // deliberately empty — the preset must drive the trigger
        assembleContext: presetCtx({ compaction: { mode: "managed", thresholdPct: 0.5 }, maxContextTokens: 400 }),
      }),
    );
    expect(outcome.aborted).toBe(false);

    // The preset-configured pct arm fired: a marker was rebuilt even with an empty per-send intent.
    await vi.waitFor(async () => {
      const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
      expect(row?.compactSummary).toBe("MANAGED MARKER");
      expect(row?.compactedAtSeq ?? 0).toBeGreaterThan(0);
    });
  });

  test("ITEM-3 negative: a preset UNDER its own threshold does NOT fire (57% < 85% default, the no-bug case)", async () => {
    // Mirrors hypothesis (a): a preset at the 0.85 DEFAULT threshold with usage well under it must NOT compact —
    // proving the arm reads the real threshold, not a spuriously-low one. Few rows → cumulative << 0.85 × 32768.
    const chatId = await seedChatWithHistory(4);
    const engine = buildEngine();

    const outcome = await engine.runTurn(prepOf(chatId, AGENT_SDK, { intent: {}, assembleContext: presetCtx({ compaction: { mode: "managed" } }) }));
    expect(outcome.aborted).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(markerCalls).toHaveLength(0);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBeNull();
  });

  test("WEDGE-STATE (GAP 1): an over-threshold chat with a FAILING model STILL compacts (the PRE-TURN arm fires before the doomed dispatch)", async () => {
    // 16 rows: ~640 canon tokens ≥ 0.85 × 200 ceiling (over threshold) AND maxSeq(16) − verbatimTail(8) = 8 > 0
    // (a real coverage point above the current 0), so the pre-turn arm has something to compact.
    const chatId = await seedChatWithHistory(16);
    // The model FAILS every dispatch (a repetition-loop / context-overflow api_error) — the POST-turn arm never
    // runs, so without the pre-turn arm this chat could never compact its way out of the wedge.
    const failingTurn: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.reject(new Error("agent-sdk: result success-subtype flagged is_error (context overflow)"));
        yield { kind: "text", text: "" }; // unreachable — the reject above throws out of the first next()
      })();
    const engine = buildEngine(failingTurn);

    // The turn itself FAILS (the model is doomed), but the marker was stamped BEFORE the dispatch.
    const err = await engine
      .runTurn(prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "managed" }, maxContextTokens: SMALL_CAP } }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);

    // The PRE-TURN arm compacted (awaited, before the failing dispatch) — the marker + coverage are durable even
    // though the turn never committed. On the NEXT attempt the chat sends a shrunk prompt and can escape.
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBe("MANAGED MARKER");
    expect(row?.compactedAtSeq ?? 0).toBeGreaterThan(0);
    expect(markerCalls.length).toBeGreaterThan(0);
  });

  // ⑨(a) — the verbatim tail is the preset's `compaction.verbatimTail` knob, not the MANAGED_VERBATIM_TAIL
  // const. A SMALLER tail (4 vs the default 8) keeps fewer rows literal ⇒ a HIGHER coverage point (compacts
  // more): maxSeq(16) − verbatimTail(4) = 12. Uses the pre-turn arm (failing model) for an exact coverage.
  test("compaction.verbatimTail drives the coverage point (the preset knob, not a const)", async () => {
    const chatId = await seedChatWithHistory(16);
    const failingTurn: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.reject(new Error("agent-sdk: doomed dispatch"));
        yield { kind: "text", text: "" };
      })();
    const engine = buildEngine(failingTurn);

    await engine
      .runTurn(prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "managed", verbatimTail: 4 }, maxContextTokens: SMALL_CAP } }))
      .catch((e: unknown) => e);

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    // maxSeq(16) − verbatimTail(4) = 12 (vs 16 − default 8 = 8): the smaller tail compacts through a higher seq.
    expect(row?.compactedAtSeq).toBe(12);
  });

  test("WEDGE-STATE failure-honest: a FAILING pre-turn compaction does not block the turn (logs + proceeds)", async () => {
    const chatId = await seedChatWithHistory(8);
    // The marker generation THROWS, but the turn still dispatches (a committed reply) — the pre-turn compaction is
    // best-effort; its failure must never wedge a turn that could otherwise succeed.
    const ctx = makeChatContext(db, { runChatTurn: turnWithUsage({ tokensIn: 4, tokensOut: 2 }) });
    const throwingMarker: ChatContext["runChatTurn"] = () => {
      throw new Error("marker provider down");
    };
    const { runCompaction } = createCompaction(makeChatContext(db, { runChatTurn: throwingMarker }), {
      emit: () => Promise.resolve(),
      quietGenerate: createQuietGenerate({ runChatTurn: throwingMarker, resolveChatPresetParams: () => Promise.resolve({}) }),
      resolveConnection: () => Promise.resolve(AGENT_SDK),
    });
    const engine = createTurnEngine(ctx, {
      emit: () => Promise.resolve(),

      holder: "r1",
      lockTtlMs: 60_000,
      generateSegments,
      generateDigests,
      loadWitnessHorizons,
      recallMemory,
      runCompaction,
    });

    const outcome = await engine.runTurn(prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "managed" }, maxContextTokens: SMALL_CAP } }));
    // The turn COMPLETED despite the pre-turn compaction failing (logged + proceeded); no marker was written.
    expect(outcome.aborted).toBe(false);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBeNull();
  });

  test("NO-WALL INVARIANT (owner ruling): a permanently-failing summarizer + over-WINDOW context still completes the turn — trimmed, warned, no marker", async () => {
    // The safety property made a test: compaction is a wall against context growth. Even when the marker generation
    // NEVER succeeds AND the context already exceeds the model's WINDOW, the turn must complete (degraded-and-loud),
    // never error-and-dead — the no-wall belt fit-trims the seed (drop-oldest → the turn survives) and emits a
    // VISIBLE `context_trimmed_no_summary` warning.
    const tinyWindow = 300; // small enough that ~16 rows of history exceed the WINDOW itself (not just a soft cap)
    const smallWindowSdk: Resolved<"chat"> = {
      ...AGENT_SDK,
      capability: makeCapability({ ...generationOf(AGENT_SDK), context: { ...generationOf(AGENT_SDK).context, window: tinyWindow } }),
    };
    const chatId = await seedChatWithHistory(16); // ~640 tokens ≥ 300 window
    const emitted: ChatBusEvent[] = [];
    // The marker generation ALWAYS throws — a permanently-failing summarizer (an outage / a doomed model).
    const failingMarker: ChatContext["runChatTurn"] = () => {
      throw new Error("summarizer permanently down");
    };
    const ctx = makeChatContext(db, { runChatTurn: turnWithUsage({ tokensIn: 4, tokensOut: 2 }) });
    const { runCompaction } = createCompaction(makeChatContext(db, { runChatTurn: failingMarker }), {
      emit: () => Promise.resolve(),
      quietGenerate: createQuietGenerate({ runChatTurn: failingMarker, resolveChatPresetParams: () => Promise.resolve({}) }),
      resolveConnection: () => Promise.resolve(smallWindowSdk),
    });
    const engine = createTurnEngine(ctx, {
      emit: (e: ChatBusEvent) => {
        emitted.push(e);
        return Promise.resolve();
      },

      holder: "r1",
      lockTtlMs: 60_000,
      generateSegments,
      generateDigests,
      loadWitnessHorizons,
      recallMemory,
      runCompaction,
    });

    // The turn COMPLETES (never errors) despite the failing summarizer + over-window context.
    const outcome = await engine.runTurn(prepOf(chatId, smallWindowSdk, { intent: { compaction: { mode: "managed" } } }));
    expect(outcome.aborted).toBe(false);
    // No marker was written (the summarizer never succeeded)…
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBeNull();
    // …but the degradation is LOUD: the no-wall belt emitted the visible warning.
    expect(emitted.some((e) => e.type === "warning" && e.code === "context_trimmed_no_summary")).toBe(true);
  });

  test("STATELESS api with the SAME blown fit does NOT compact (agent-sdk-API-only write gate)", async () => {
    const chatId = await seedChatWithHistory(8);
    const engine = buildEngine();

    const outcome = await engine.runTurn(prepOf(chatId, STATELESS, { intent: { compaction: { mode: "managed" }, maxContextTokens: SMALL_CAP } }));
    expect(outcome.aborted).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(markerCalls).toHaveLength(0);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBeNull();
  });

  test("mode:auto (not managed) never runs OUR marker generation even on agent-sdk", async () => {
    const chatId = await seedChatWithHistory(8);
    const engine = buildEngine();

    const outcome = await engine.runTurn(prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "auto" }, maxContextTokens: SMALL_CAP } }));
    expect(outcome.aborted).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(markerCalls).toHaveLength(0);
  });

  test("nothing dropped + under threshold → the hook is a no-op", async () => {
    const chatId = await seedChatWithHistory(4);
    const engine = buildEngine();

    const outcome = await engine.runTurn(prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "managed" } } }));
    expect(outcome.aborted).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(markerCalls).toHaveLength(0);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBeNull();
  });

  test("SDK-DELTA finding: a resuming session's tiny provider tokensIn does NOT blind the pct arm (fit estimate governs)", async () => {
    const chatId = await seedChatWithHistory(8);
    // The role turn reports the SDK's per-turn DELTA (tiny tokensIn) against a HUGE window — the OLD provider-preferred
    // logic would compute `2/200000 << pct` and NOT fire; the fit estimate (small maxContextTokens ceiling, full canon)
    // crosses the pct AND drops rows, so the marker fires. Hosted-verified: SDK tokensIn is a delta, not cumulative.
    const summarize: ChatContext["summarize"] = () =>
      Promise.resolve({ items: [{ text: "M", usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }], model: "s" });
    const ctx = makeChatContext(db, { runChatTurn: turnWithUsage({ tokensIn: 2, tokensOut: 2, contextWindow: 200_000 }), summarize });
    const { runCompaction } = createCompaction(makeChatContext(db, { runChatTurn: markerRunChatTurn }), {
      emit: () => Promise.resolve(),
      quietGenerate: createQuietGenerate({ runChatTurn: markerRunChatTurn, resolveChatPresetParams: () => Promise.resolve({}) }),
      resolveConnection: () => Promise.resolve(AGENT_SDK),
    });
    const engine = createTurnEngine(ctx, {
      emit: () => Promise.resolve(),

      holder: "r1",
      lockTtlMs: 60_000,
      generateSegments,
      generateDigests,
      loadWitnessHorizons,
      recallMemory,
      runCompaction,
    });

    await engine.runTurn(prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "managed" }, maxContextTokens: SMALL_CAP } }));
    await vi.waitFor(async () => {
      const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
      expect(row?.compactSummary).toBe("MANAGED MARKER");
    });
  });

  test("re-running the SAME coverage point re-generates NOTHING (durable compactedAtSeq idempotence)", async () => {
    const chatId = await seedChatWithHistory(8);
    const engine = buildEngine();
    const cap = { intent: { compaction: { mode: "managed" as const }, maxContextTokens: SMALL_CAP } };

    await engine.runTurn(prepOf(chatId, AGENT_SDK, cap));
    await vi.waitFor(() => expect(markerCalls.length).toBeGreaterThan(0));
    const [afterFirst] = await db.select().from(chats).where(eq(chats.id, chatId));
    const coveredAt = afterFirst?.compactedAtSeq ?? 0;
    expect(coveredAt).toBeGreaterThan(0);

    // Directly re-run the core at the SAME coverage point (what a stalled/unchanged-boundary re-fire would do):
    // the durable `compactedAtSeq` no-ops it — the window is empty, nothing regenerates.
    markerCalls.length = 0;
    const { runCompaction } = createCompaction(makeChatContext(db, { runChatTurn: markerRunChatTurn }), {
      emit: () => Promise.resolve(),
      quietGenerate: createQuietGenerate({ runChatTurn: markerRunChatTurn, resolveChatPresetParams: () => Promise.resolve({}) }),
      resolveConnection: () => Promise.resolve(AGENT_SDK),
    });
    const res = await runCompaction({ chatId, connection: AGENT_SDK, ownerId: HOST, coveragePoint: coveredAt });
    expect(res.updated).toBe(false);
    expect(markerCalls).toHaveLength(0);
  });

  test("SINGLE-FLIGHT: two turns fired without awaiting the first's compaction generate the marker at most once concurrently", async () => {
    const chatId = await seedChatWithHistory(8);
    // A GATED marker generation: it blocks until released, so we can observe how many run CONCURRENTLY.
    let running = 0;
    let maxConcurrent = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gatedRunChatTurn: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        running += 1;
        maxConcurrent = Math.max(maxConcurrent, running);
        await gate;
        running -= 1;
        yield { kind: "final", economics: { content: "MARKER", model: testModelId("stub"), costUsd: 0 } };
      })();
    const ctx = makeChatContext(db, { runChatTurn: turnWithUsage({ tokensIn: 4, tokensOut: 2 }) });
    const { runCompaction } = createCompaction(makeChatContext(db, { runChatTurn: gatedRunChatTurn }), {
      emit: () => Promise.resolve(),
      quietGenerate: createQuietGenerate({ runChatTurn: gatedRunChatTurn, resolveChatPresetParams: () => Promise.resolve({}) }),
      resolveConnection: () => Promise.resolve(AGENT_SDK),
    });
    const engine = createTurnEngine(ctx, {
      emit: () => Promise.resolve(),

      holder: "r1",
      lockTtlMs: 60_000,
      generateSegments,
      generateDigests,
      loadWitnessHorizons,
      recallMemory,
      runCompaction,
    });
    const cap = { intent: { compaction: { mode: "managed" as const }, maxContextTokens: SMALL_CAP } };

    // Two turns back-to-back; the first's compaction is still gated when the second fires.
    await engine.runTurn(prepOf(chatId, AGENT_SDK, cap));
    await engine.runTurn(prepOf(chatId, AGENT_SDK, cap));
    await new Promise((resolve) => setTimeout(resolve, 30));
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 30));

    // The single-flight Set held it to ONE concurrent marker build for the chat.
    expect(maxConcurrent).toBeLessThanOrEqual(1);
  });

  test("preset compaction.instructions override the default (threaded into the marker generation)", async () => {
    const chatId = await seedChatWithHistory(8);
    const engine = buildEngine();

    await engine.runTurn(
      prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "managed", instructions: "CUSTOM-STEER-XYZ" }, maxContextTokens: SMALL_CAP } }),
    );

    await vi.waitFor(() => expect(markerCalls.length).toBeGreaterThan(0));
    const userText = markerCalls.at(-1)?.userText ?? "";
    expect(userText).toContain("CUSTOM-STEER-XYZ");
    expect(userText).not.toContain(DEFAULT_COMPACT_INSTRUCTIONS);
  });

  // ── #1436: the PRE-TURN arm is AWAITED before dispatch, so it is on the cancellation path. It took no
  // signal, so a cancelled request kept paying for — and blocking on — a summary nobody was waiting for, and
  // then dispatched the turn it had already been told to drop.

  test("a CANCELLED turn cancels its pre-turn compaction and never dispatches (#1436)", async () => {
    const chatId = await seedChatWithHistory(16);
    const controller = new AbortController();
    let markerSawSignal = false;
    let turnCalls = 0;
    // The summarizer honors the threaded signal exactly as the provider stream does: the caller presses Stop
    // while the marker is in flight, and the generation throws its name-based AbortError.
    const cancellableMarker: ChatContext["runChatTurn"] = (req) =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        markerSawSignal = req.signal !== undefined;
        controller.abort();
        if (req.signal?.aborted === true) {
          const err = new Error("marker generation aborted");
          err.name = "AbortError";
          await Promise.reject(err);
        }
        yield { kind: "final", economics: { content: "MANAGED MARKER", model: testModelId("stub"), costUsd: 0.001 } };
      })();
    const countedTurn: ChatContext["runChatTurn"] = (req) => {
      turnCalls += 1;
      return (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "final", economics: { content: `dispatched (aborted=${String(req.signal?.aborted)})`, model: testModelId("test-model") } };
      })();
    };
    const ctx = makeChatContext(db, { runChatTurn: countedTurn });
    const { runCompaction } = createCompaction(makeChatContext(db, { runChatTurn: cancellableMarker }), {
      emit: () => Promise.resolve(),
      quietGenerate: createQuietGenerate({ runChatTurn: cancellableMarker, resolveChatPresetParams: () => Promise.resolve({}) }),
      resolveConnection: () => Promise.resolve(AGENT_SDK),
    });
    const engine = createTurnEngine(ctx, {
      emit: () => Promise.resolve(),

      holder: "r1",
      lockTtlMs: 60_000,
      generateSegments,
      generateDigests,
      loadWitnessHorizons,
      recallMemory,
      runCompaction,
    });

    const outcome = await engine.runTurn(
      prepOf(chatId, AGENT_SDK, { signal: controller.signal, intent: { compaction: { mode: "managed" }, maxContextTokens: SMALL_CAP } }),
    );

    // The turn's signal REACHED the summarizer — the cancellation is honored where the cost is being paid.
    expect(markerSawSignal).toBe(true);
    // A cancelled compaction is NOT a failed one: it does not fall through to "log + proceed", so the turn
    // never dispatched and the caller's Stop is a clean outcome.
    expect(turnCalls).toBe(0);
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("user");
    // Nothing was written — a cancelled marker leaves the existing (absent) one untouched.
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBeNull();
  });

  test("a THROWING summarizer is still a FAILURE, not a cancellation — the turn proceeds (#1436 fence)", async () => {
    // The other half of the distinction: with the signal un-aborted, a summarizer fault keeps its old
    // failure-honest contract (log + dispatch anyway). Only cancellation short-circuits the turn.
    const chatId = await seedChatWithHistory(16);
    let turnCalls = 0;
    const throwingMarker: ChatContext["runChatTurn"] = () => {
      throw new Error("summarizer down");
    };
    const countedTurn: ChatContext["runChatTurn"] = () => {
      turnCalls += 1;
      return (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "final", economics: { content: "Hi there", model: testModelId("test-model") } };
      })();
    };
    const ctx = makeChatContext(db, { runChatTurn: countedTurn });
    const { runCompaction } = createCompaction(makeChatContext(db, { runChatTurn: throwingMarker }), {
      emit: () => Promise.resolve(),
      quietGenerate: createQuietGenerate({ runChatTurn: throwingMarker, resolveChatPresetParams: () => Promise.resolve({}) }),
      resolveConnection: () => Promise.resolve(AGENT_SDK),
    });
    const engine = createTurnEngine(ctx, {
      emit: () => Promise.resolve(),

      holder: "r1",
      lockTtlMs: 60_000,
      generateSegments,
      generateDigests,
      loadWitnessHorizons,
      recallMemory,
      runCompaction,
    });

    const outcome = await engine.runTurn(prepOf(chatId, AGENT_SDK, { intent: { compaction: { mode: "managed" }, maxContextTokens: SMALL_CAP } }));
    expect(outcome.aborted).toBe(false);
    expect(turnCalls).toBe(1);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBeNull();
  });
});
