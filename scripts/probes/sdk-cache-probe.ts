#!/usr/bin/env tsx

/**
 * pnpm sdk:cache-probe [--scenario s1,s2,…] [--model <id>] [--verbose]
 *
 * The agent-sdk DE-BLACK-BOXING harness: live, tiny Max-sub turns (mode-1 — the host `claude login`
 * credential through the SAME env firewall a real turn uses) that measure what does and does NOT break
 * the Anthropic prompt cache through the SDK, and which mid-conversation context channels actually work.
 * Every scenario prints per-turn usage (in/out/cacheRead/cacheWrite/cost) + a PASS/FAIL verdict for its
 * expectation. Costs pennies (Haiku, ~6k-token prompts, capped output) — but it DOES spend real sub
 * quota, so it is a hand-run probe, never CI.
 *
 * WHY each scenario exists:
 *   s1  resume-cache-survival — fresh turn writes cache; a RESUMED turn must read it. Also the live
 *       validation that resume-from-the-INJECTED-store works on the current SDK (PD-7's foundation).
 *   s2  seed-recall — frames synthesized from canon (buildSeedFrames via ensureSeededSession) resume
 *       AND the model can read a seeded fact (the neo seed-probe assertion, re-run per SDK upgrade).
 *   s3  reseed-byte-identity — a COLD-CACHE rebuild (fresh store, same canon) yields the same session id
 *       and byte-identical frames → the API-side content cache still hits. Proves cross-restart resume
 *       needs NO durable store.
 *   s4  joined-dynamic-tail-cost — today's live shape (static+dynamic joined into ONE system string):
 *       changing the dynamic tail should bust the whole system block. Quantifies what s5/s6 would save.
 *   s5  array-systemPrompt-split — the SDK's [static, dynamic] form: does changing part 2 preserve a
 *       cache hit on part 1, and does the boundary sentinel still leak into context (the 0.3.19x-era
 *       leak that made translate.ts join the halves)?
 *   s6  hook-context-injection — dynamicContextOptions (UserPromptSubmit additionalContext): does the
 *       channel work under the locked firewall config, does the model see it, and does injecting it on
 *       a RESUMED session keep the history cache warm?
 *   s7  api-system-seed — a seeded `{type:"api_system"}` frame + ANTHROPIC_BETAS=
 *       mid-conversation-system-2026-04-07: does the runtime accept a true mid-conversation
 *       `role:"system"` message from the transcript, and does the model obey it?
 *   s8  cross-session-content-cache — two FRESH sessions, identical request: the second should
 *       cache-read the first's prefix (content-keyed caching — what makes per-speaker group reseeds
 *       affordable).
 *   s9  fork-swipe — seed canon A, turn; swipe to canon B (a diverged tail), turn; swipe BACK to A, turn.
 *       Prints each turn's disposition + cacheRead/cacheWrite. VERDICT: the third turn RE-ADOPTS lineage A
 *       (disposition `readopted`/`resumed`) instead of reseeding — the fork-lineage invariant, live.
 */

import process from "node:process";
import type { Options, SDKMessage, SessionStore } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatResult } from "@orb/server/infra/providers";
import { buildClaudeOpenRouterEnv, buildClaudeSdkEnv, consumeTurnStream, dynamicContextOptions } from "@orb/server/infra/providers/backends/agent-sdk";
import { buildSeedFrames, InMemorySessionStore, SessionCache, seedSessionId, toSeedTurns } from "@orb/server/infra/providers/backends/agent-sdk/session";

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const MODEL_FLAG = argValue("--model");
const ONLY = new Set((argValue("--scenario") ?? argValue("-s"))?.split(",").map((s) => s.trim()) ?? []);
const VERBOSE = args.includes("--verbose");
/** --mode sub (default: the Max-sub mode-1 firewall env) | or (mode-2: the OpenRouter Anthropic skin).
 *  The OR key rides OPENROUTER_PROBE_KEY (probe-run plumbing — a scoped test key, never app config). */
const MODE = argValue("--mode") ?? "sub";
// biome-ignore lint/style/noProcessEnv: OPENROUTER_PROBE_KEY is probe-run plumbing (scoped test key), not app config — probes run outside the foundation/env perimeter.
const OR_PROBE_KEY = process.env["OPENROUTER_PROBE_KEY"] ?? "";
if (MODE === "or" && OR_PROBE_KEY.length === 0) {
  throw new Error("--mode or requires OPENROUTER_PROBE_KEY in the environment");
}
/** Probe-run OR tier trio — every tier pinned to haiku so a probe can never accidentally burn
 *  opus-priced credits (mirrors sdk-session-probe). A real turn derives this from the live catalogs. */
const OR_PROBE_TIER_MODELS = {
  opus: "anthropic/claude-haiku-4.5",
  sonnet: "anthropic/claude-haiku-4.5",
  haiku: "anthropic/claude-haiku-4.5",
} as const;
/** The per-mode firewall env — the SAME builders a real turn uses. */
function probeEnv(overrides: Parameters<typeof buildClaudeSdkEnv>[0]): Record<string, string | undefined> {
  return MODE === "or" ? buildClaudeOpenRouterEnv(OR_PROBE_KEY, OR_PROBE_TIER_MODELS, overrides) : buildClaudeSdkEnv(overrides);
}
const MODEL = MODEL_FLAG ?? (MODE === "or" ? "anthropic/claude-haiku-4.5" : "claude-haiku-4-5");

// ── Tuning constants ───────────────────────────────────────────────────────────────────────────────────
/** Output cap per turn (CLAUDE_CODE_MAX_OUTPUT_TOKENS) — keeps every probe reply tiny. */
const OUTPUT_CAP_TOKENS = 512;
/** Lore paragraphs — sized so the system prompt clears Haiku's cacheable-prefix minimum (4096 tok). */
const LORE_PARAGRAPHS = 110;
/** Reply excerpt length in logs/verdicts. */
const SNIPPET = 80;
/** Cost column decimals in the usage table. */
const COST_DECIMALS = 5;
/** Deterministic timestamp for the seeded api_system frame (base + one step past the seed frames). */
const APISYS_TS_MS = 1_704_067_260_000;
/** Recall matchers — top-level per the useTopLevelRegex discipline. */
const KALVEX_RE = /kalvex/iu;
const MARLA_RE = /marla/iu;
const AMBER_RE = /amber/iu;

// ── Shared fixtures ────────────────────────────────────────────────────────────────────────────────────

/** Deterministic ~6k-token lore block — big enough to clear the cacheable-prefix minimum, byte-stable
 *  across runs so cross-run comparisons mean something. */
const LORE = Array.from(
  { length: LORE_PARAGRAPHS },
  (_, i) =>
    `Chronicle ${i}: In the ${i}th year of the Ember Accord, the wardens of Khal-Toruun sealed the obsidian gate beneath the singing dunes, and the caravans learned to route their salt and silver through the high passes of Veyra, where the wind keeps the old names and the toll-keepers keep the older grudges. The ledger of that year records forty-one crossings, three broken oaths, and one dragon sighting that the archivists still dispute.`,
).join("\n");
const STATIC_SYSTEM = `You are a terse lore assistant for the world described below. Answer in one short sentence unless asked otherwise.\n\n${LORE}`;

const RECALL_CANON = [
  { role: "user" as const, content: "Tell me about the dragon of the western pass." },
  {
    role: "assistant" as const,
    content: "The dragon's name is Kalvex, keeper of the western pass and hoarder of salt-ledgers.",
  },
];

interface Row {
  readonly scenario: string;
  readonly turn: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly costUsd: number;
  readonly note: string;
}
const rows: Row[] = [];
const verdicts: { scenario: string; pass: boolean; detail: string }[] = [];

function record(scenario: string, turn: string, r: ChatResult, note = ""): void {
  rows.push({
    scenario,
    turn,
    tokensIn: r.usage.tokensIn,
    tokensOut: r.usage.tokensOut,
    cacheRead: r.usage.cacheReadTokens,
    cacheWrite: r.usage.cacheWriteTokens,
    costUsd: r.usage.costUsd,
    note,
  });
  if (VERBOSE) {
    console.log(`\n[${scenario}/${turn}] reply: ${r.reply.slice(0, SNIPPET * 2)}`);
  }
}

function verdict(scenario: string, pass: boolean, detail: string): void {
  verdicts.push({ scenario, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"} — ${detail}`);
}

// ── The turn runner (the real reducer over a real spawn, through the real mode-1 firewall env) ─────────
interface TurnSpec {
  readonly prompt: string;
  readonly store: SessionStore;
  readonly systemPrompt?: string | string[];
  readonly resume?: string;
  readonly hooks?: Options["hooks"];
  readonly extraEnv?: Record<string, string | undefined>;
}

async function runTurn(spec: TurnSpec): Promise<{ result: ChatResult; sessionId: string }> {
  let sessionId = "";
  const stream = query({
    prompt: spec.prompt,
    options: {
      // The locked firewall base (mirrors disciplineOptions without needing a branded credential).
      disallowedTools: ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"],
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      settingSources: [],
      env: { ...probeEnv({ maxOutputTokens: OUTPUT_CAP_TOKENS }), ...spec.extraEnv },
      model: MODEL,
      maxTurns: 1,
      sessionStore: spec.store,
      title: "orbweaver-cache-probe",
      ...(spec.resume !== undefined ? { resume: spec.resume } : {}),
      ...(spec.systemPrompt !== undefined ? { systemPrompt: spec.systemPrompt as never } : {}),
      ...(spec.hooks !== undefined ? { hooks: spec.hooks } : {}),
    },
  });
  const result = await consumeTurnStream(stream as AsyncIterable<SDKMessage>, {
    model: MODEL,
    resumed: spec.resume !== undefined,
    now: () => Date.now(),
    onSessionId: (id) => {
      sessionId = id;
    },
  });
  return { result, sessionId };
}

// ── Scenarios ──────────────────────────────────────────────────────────────────────────────────────────

/** s1: baseline write → resumed read. Proves injected-store resume + cache survival across turns. */
async function s1(shared: { store: SessionStore; sessionId?: string }): Promise<void> {
  const a = await runTurn({
    prompt: "In one word, what is sealed beneath the singing dunes?",
    store: shared.store,
    systemPrompt: STATIC_SYSTEM,
  });
  record("s1", "fresh", a.result);
  const b = await runTurn({
    prompt: "And in one word, through whose high passes do the caravans route?",
    store: shared.store,
    systemPrompt: STATIC_SYSTEM,
    resume: a.sessionId,
  });
  record("s1", "resumed", b.result);
  shared.sessionId = b.sessionId.length > 0 ? b.sessionId : a.sessionId;
  verdict(
    "s1",
    b.result.usage.cacheReadTokens > 0,
    `resumed turn cacheRead=${b.result.usage.cacheReadTokens} (want >0; fresh turn wrote ${a.result.usage.cacheWriteTokens})`,
  );
}

/** s2: seed frames from canon resume + the model recalls the seeded fact. */
async function s2(): Promise<void> {
  const cache = new SessionCache(new InMemorySessionStore());
  // ensureSeededSession returns the decision object (sessionId + disposition) since the observability
  // lane; the probe only needs the id to resume by.
  const resume = (await cache.ensureSeededSession(castId<ChatId>("probe-chat-s2"), RECALL_CANON)).sessionId;
  if (resume === null) {
    verdict("s2", false, "ensureSeededSession returned null for a non-empty canon");
    return;
  }
  const r = await runTurn({
    prompt: "What is the dragon's name? Answer with the single name only.",
    store: cache.store,
    systemPrompt: STATIC_SYSTEM,
    resume,
  });
  record("s2", "seeded", r.result);
  verdict("s2", KALVEX_RE.test(r.result.reply), `seeded-fact recall — reply: "${r.result.reply.slice(0, SNIPPET)}"`);
}

/** s3: cold-cache rebuild (fresh store, same canon) → same session id, byte-identical frames → the
 *  API-side content cache should still hit on the unchanged prefix. */
async function s3(): Promise<void> {
  const cacheA = new SessionCache(new InMemorySessionStore());
  const idA = (await cacheA.ensureSeededSession(castId<ChatId>("probe-chat-s3"), RECALL_CANON)).sessionId;
  const a = await runTurn({
    prompt: "What is the dragon's name? Single name only.",
    store: cacheA.store,
    systemPrompt: STATIC_SYSTEM,
    ...(idA !== null ? { resume: idA } : {}),
  });
  record("s3", "warm-write", a.result);

  // "Restart": everything in-memory is gone; only canon (and the deterministic builders) survive.
  const cacheB = new SessionCache(new InMemorySessionStore());
  const idB = (await cacheB.ensureSeededSession(castId<ChatId>("probe-chat-s3"), RECALL_CANON)).sessionId;
  const b = await runTurn({
    prompt: "And what does Kalvex hoard? Two words.",
    store: cacheB.store,
    systemPrompt: STATIC_SYSTEM,
    ...(idB !== null ? { resume: idB } : {}),
  });
  record("s3", "cold-rebuild", b.result, `idA===idB: ${idA === idB}`);
  verdict(
    "s3",
    idA === idB && b.result.usage.cacheReadTokens > 0,
    `deterministic id ${idA === idB ? "stable" : "DRIFTED"}; cold-rebuild cacheRead=${b.result.usage.cacheReadTokens} (want >0)`,
  );
}

/** s4: the live joined-systemPrompt shape — a changed dynamic tail should bust the system block. */
async function s4(): Promise<void> {
  const a = await runTurn({
    prompt: "One word: what do the toll-keepers keep?",
    store: new InMemorySessionStore(),
    systemPrompt: `${STATIC_SYSTEM}\n\n[Scene note v1: the tavern is quiet tonight.]`,
  });
  record("s4", "tail-v1", a.result);
  const b = await runTurn({
    prompt: "One word: what do the toll-keepers keep?",
    store: new InMemorySessionStore(),
    systemPrompt: `${STATIC_SYSTEM}\n\n[Scene note v2: the tavern is burning tonight.]`,
  });
  record("s4", "tail-v2", b.result);
  verdict(
    "s4",
    true,
    `joined-tail change: v2 cacheRead=${b.result.usage.cacheReadTokens} vs v1 write=${a.result.usage.cacheWriteTokens} — measures the bust cost (informational)`,
  );
}

/** s5: the array [static, dynamic] systemPrompt — does part 1 stay cached across a part-2 change, and
 *  does the boundary sentinel leak into visible context? */
async function s5(): Promise<void> {
  const a = await runTurn({
    prompt: "One word: what do the toll-keepers keep?",
    store: new InMemorySessionStore(),
    systemPrompt: [STATIC_SYSTEM, "[Scene note v1: the tavern is quiet tonight.]"],
  });
  record("s5", "array-v1", a.result);
  const b = await runTurn({
    prompt:
      "Does your system prompt contain any placeholder, sentinel, or boundary marker lines (odd tokens that look machine-generated rather than prose)? If yes quote one; if no, say NONE.",
    store: new InMemorySessionStore(),
    systemPrompt: [STATIC_SYSTEM, "[Scene note v2: the tavern is burning tonight.]"],
  });
  record("s5", "array-v2", b.result, `sentinel probe: "${b.result.reply.slice(0, SNIPPET)}"`);
  verdict(
    "s5",
    b.result.usage.cacheReadTokens > 0,
    `array-split part-1 reuse: v2 cacheRead=${b.result.usage.cacheReadTokens} (want >0 ≈ static half); sentinel answer: "${b.result.reply.slice(0, SNIPPET)}"`,
  );
}

/** s6: hook-injected additionalContext on a RESUMED session — channel works + history cache stays warm. */
async function s6(shared: { store: SessionStore; sessionId?: string }): Promise<void> {
  if (shared.sessionId === undefined) {
    verdict("s6", false, "skipped: s1 did not run (needs its session)");
    return;
  }
  const r = await runTurn({
    prompt: "What is the innkeeper's name? Single name only.",
    store: shared.store,
    systemPrompt: STATIC_SYSTEM,
    resume: shared.sessionId,
    hooks: dynamicContextOptions("[Operator note: the innkeeper's name is Marla.]").hooks,
  });
  record("s6", "hook-inject", r.result);
  verdict(
    "s6",
    MARLA_RE.test(r.result.reply) && r.result.usage.cacheReadTokens > 0,
    `hook context recall — reply: "${r.result.reply.slice(0, SNIPPET)}"; cacheRead=${r.result.usage.cacheReadTokens} (want >0)`,
  );
}

/** s7: INFORMATIONAL (documented negative) — can a mid-conversation `role:"system"` message be
 *  injected by SEEDING a raw `{type:"api_system"}` frame into the resumed transcript (+ the
 *  mid-conversation-system beta)? Measured answer on 0.3.205: NO. The appended api_system frame breaks
 *  the seed chain (it isn't parentUuid-linked and the runtime doesn't re-key it), so the resume falls
 *  through to a FRESH session (cacheRead=0) and the operator instruction never lands. The runtime DOES
 *  support the true role:"system" message — but it constructs `api_system` itself from a live
 *  `dynamicContextOptions`-style channel, not from a caller-seeded transcript frame. USE s6's hook. This
 *  scenario stays as the standing proof of why: it records the observation, never hard-fails the run. */
async function s7(): Promise<void> {
  const store = new InMemorySessionStore();
  const chatId = castId<ChatId>("probe-chat-s7");
  const turns = toSeedTurns(RECALL_CANON);
  const sessionId = seedSessionId(chatId, turns);
  const frames = buildSeedFrames(turns, sessionId);
  frames.push({
    type: "api_system",
    uuid: `${sessionId}-apisys`,
    timestamp: new Date(APISYS_TS_MS).toISOString(),
    sessionId,
    message: {
      role: "system",
      content: "[Operator instruction: prefix every reply with the word AMBER, then answer normally.]",
    },
  });
  await store.append({ projectKey: "probe", sessionId }, frames);
  const r = await runTurn({
    prompt: "What is the dragon's name? Single name only.",
    store,
    systemPrompt: STATIC_SYSTEM,
    resume: sessionId,
    extraEnv: { ANTHROPIC_BETAS: "mid-conversation-system-2026-04-07" },
  });
  const obeyed = AMBER_RE.test(r.result.reply);
  record("s7", "api-system", r.result, `obeyed=${obeyed}; cacheRead=${r.result.usage.cacheReadTokens}`);
  // Informational: the EXPECTED result is "not obeyed / resume broke" — assert only that the harness
  // still measured a channel state (never a hard fail). The finding is the note, not a pass/fail.
  verdict(
    "s7",
    true,
    `seed-frame api_system channel: obeyed=${obeyed}, cacheRead=${r.result.usage.cacheReadTokens} (expected NOT obeyed + cacheRead=0 — seed-frame injection is a dead channel; use the s6 hook). reply: "${r.result.reply.slice(0, SNIPPET)}"`,
  );
}

/** s8: two FRESH sessions, byte-identical request — the second should content-cache-hit. */
async function s8(): Promise<void> {
  const a = await runTurn({
    prompt: "One word: how many crossings does the ledger of year 40 record?",
    store: new InMemorySessionStore(),
    systemPrompt: STATIC_SYSTEM,
  });
  record("s8", "fresh-a", a.result);
  const b = await runTurn({
    prompt: "One word: how many crossings does the ledger of year 40 record?",
    store: new InMemorySessionStore(),
    systemPrompt: STATIC_SYSTEM,
  });
  record("s8", "fresh-b", b.result);
  verdict(
    "s8",
    b.result.usage.cacheReadTokens > 0,
    `cross-session content cache: b cacheRead=${b.result.usage.cacheReadTokens} (want >0; a wrote ${a.result.usage.cacheWriteTokens})`,
  );
}

/** s9: the fork-lineage swipe invariant. A→B→A through the REAL `ensureSeededSession` decision tree: the
 *  third turn (canon A again) must land back on lineage A as a plain resume/readopt — never a reseed. */
async function s9(): Promise<void> {
  const cache = new SessionCache(new InMemorySessionStore());
  const chatId = castId<ChatId>("probe-chat-s9");
  const canonA = [
    { role: "user" as const, content: "Name the dragon of the western pass in one word." },
    { role: "assistant" as const, content: "Kalvex." },
    { role: "user" as const, content: "Now describe the singing dunes in one sentence." },
  ];
  // Canon B: same prefix, a DIVERGED last-assistant tail (a swipe of the Kalvex reply).
  const canonB = [
    { role: "user" as const, content: "Name the dragon of the western pass in one word." },
    { role: "assistant" as const, content: "Vorreth." },
    { role: "user" as const, content: "Now describe the singing dunes in one sentence." },
  ];
  const dispositions: string[] = [];
  async function turn(label: string, canon: typeof canonA): Promise<void> {
    const decision = await cache.ensureSeededSession(chatId, canon);
    dispositions.push(decision.disposition);
    const r = await runTurn({
      prompt: "In one short sentence, describe the singing dunes.",
      store: cache.store,
      systemPrompt: STATIC_SYSTEM,
      ...(decision.sessionId !== null ? { resume: decision.sessionId } : {}),
    });
    record("s9", label, r.result, `disposition=${decision.disposition}`);
  }
  await turn("A1", canonA);
  await turn("B", canonB);
  await turn("A2", canonA);
  const third = dispositions[2];
  verdict(
    "s9",
    third === "readopted" || third === "resumed",
    `A→B→A dispositions=[${dispositions.join(", ")}] — third turn back on lineage A as "${third}" (want readopted/resumed, NOT reseeded/forked)`,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const shared: { store: SessionStore; sessionId?: string } = {
    store: new InMemorySessionStore(),
  };
  const all: ReadonlyArray<readonly [string, () => Promise<void>]> = [
    ["s1", (): Promise<void> => s1(shared)],
    ["s2", s2],
    ["s3", s3],
    ["s4", s4],
    ["s5", s5],
    ["s6", (): Promise<void> => s6(shared)],
    ["s7", s7],
    ["s8", s8],
    ["s9", s9],
  ];
  console.log(`sdk-cache-probe — model=${MODEL} (${MODE === "or" ? "mode-2 OR skin" : "mode-1 Max sub"}; spends real quota/credits)\n`);
  for (const [name, run] of all) {
    if (ONLY.size > 0 && !ONLY.has(name)) {
      continue;
    }
    console.log(`── ${name} ──`);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: scenarios are sequential BY DESIGN — s6 reuses s1's session, and serial turns keep the cache-metric attribution unambiguous.
      await run();
    } catch (error) {
      verdict(name, false, `threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\n=== usage table ===");
  console.table(
    rows.map((r) => ({
      scenario: `${r.scenario}/${r.turn}`,
      in: r.tokensIn,
      out: r.tokensOut,
      cacheRead: r.cacheRead,
      cacheWrite: r.cacheWrite,
      cost: r.costUsd.toFixed(COST_DECIMALS),
      note: r.note,
    })),
  );
  const failed = verdicts.filter((v) => !v.pass);
  console.log(`\n${verdicts.length - failed.length}/${verdicts.length} scenario checks passed`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

await main();
