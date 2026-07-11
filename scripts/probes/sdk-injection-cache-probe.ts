#!/usr/bin/env tsx
/**
 * pnpm sdk:injection-cache-probe [--scenario d2-user-volatile,g-d2,…] [--mode sub|or] [--model <id>]
 *                                [--verbose] [--dry-run]
 *
 * The injection × caching matrix: does an `in_chat` at-depth injection coexist with the bundled CLI's
 * prefix caching on the agent-sdk arm, and at what depth/role/stability does it go cold? Companion to
 * sdk-cache-probe (raw cache physics) and sdk-behavior-probe (what the model perceives) — this one runs
 * the REAL assembly path (spliceInChatInjections → squashSameRole → the last-assistant seed/prompt split)
 * so the injection lands exactly where production puts it, then measures both caching layers per cell:
 *
 *   layer (a) — orbweaver's lineage gate: seedSessionId is a CONTENT HASH over every seed turn
 *       (session/frames.ts:328), so any injection byte that lands in the SEED half of the split changes
 *       the session id → ensureSeededSession forks/reseeds → the CLI resumes a different lineage. The
 *       probe reads the decision's `disposition` (resumed/readopted vs forked/reseeded/seeded) as the
 *       layer-(a) signal — computed deterministically (and for FREE, no spawn) in --dry-run.
 *   layer (b) — Anthropic's content-keyed prefix cache: the first differing byte busts only the SUFFIX;
 *       a forked lineage sharing a byte-prefix with a prior request can still partial-hit. The probe
 *       reads turn-2 cacheRead/cacheWrite (result-frame usage) as the layer-(b) signal and classifies:
 *       prefix-cached (read high, write ≈ tail only) | partial (read high, write > tail) | cold (read≈0).
 *
 * MATRIX: depth {0,1,2,4} × role {system,user,assistant} × stability {stable,volatile} — 24 cells, each
 * a 2-turn REPLAY (turn 2 identical to turn 1 except the injection content on volatile cells). Everything
 * else is byte-held: same ~12.6k-token lore system prompt (clears every model's min cacheable-prefix
 * floor), same canon, same tail question, same output cap, same lineage discipline (fresh store per cell
 * so salt state never leaks between cells). Positional sub-check: every canon row carries a codeword and
 * the tail question asks for the earliest→latest codeword order, so a cache win can't secretly be the
 * injection being dropped (the sdk-behavior-probe technique); volatile cells must echo the V2 sigil on
 * turn 2 (proves the changed bytes actually reached the model).
 *
 * GROW cells (the steady-state confound the replay matrix can't see): tail-relative depth MOVES as canon
 * grows, and a tail-riding injection enters the RECORDED transcript but never canon — so even a byte-
 * STABLE injection is predicted to diverge the stored lineage on the NEXT turn. g-none (control: grown
 * canon must readopt — the s9 machinery), g-d0 (tail note → fork at the user run), g-d2 (mid-seed note
 * moves → fork), g-top (over-deep clamp anchors at the TOP — the one position-stable in_chat placement).
 *
 * Predictions + the option space live in reports/agent-sdk/depth-injection-caching.md. Costs pennies
 * (Haiku, capped output) but spends real sub quota / OR credits — HAND-RUN ONLY, never CI.
 */

import process from "node:process";
import type { SDKMessage, SessionStore } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ChatInjection } from "@orb/contracts/chat";
import type { ChatResult } from "@orb/server/infra/providers";
import {
  buildClaudeOpenRouterEnv,
  buildClaudeSdkEnv,
  consumeTurnStream,
  dynamicContextOptions,
} from "@orb/server/infra/providers/backends/agent-sdk";
import type { SeedTurn } from "@orb/server/infra/providers/backends/agent-sdk/session";
import {
  InMemorySessionStore,
  SessionCache,
  seedSessionId,
  toSeedTurns,
} from "@orb/server/infra/providers/backends/agent-sdk/session";
import { AGENT_PROMPT_TAIL_JOINER } from "@orb/server/infra/providers/contract";
// The PRODUCTION splice + squash, deep-imported like the assembly tests (no assembly barrel exists).
import { spliceInChatInjections } from "../../packages/server/src/domain/chat/assembly/injections.ts";
import { squashSameRole } from "../../packages/server/src/domain/chat/assembly/role-squash.ts";

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const MODEL_FLAG = argValue("--model");
const ONLY = new Set(
  (argValue("--scenario") ?? argValue("-s"))?.split(",").map((s) => s.trim()) ?? [],
);
/** The FOLLOWUP scenario (`--scenario followup` | `f`) runs the two follow-up arms (ARM A structural
 *  isolation + ARM B the hook channel) INSTEAD of the 24-cell matrix + grow cells — it isolates the two
 *  mysteries the first live run surfaced (see the FOLLOWUP SCENARIO block below). */
const FOLLOWUP = ONLY.has("followup") || ONLY.has("f");
const VERBOSE = args.includes("--verbose");
/** Prints the planned cells + the FREE deterministic seed-hash predictions and spawns NOTHING. */
const DRY_RUN = args.includes("--dry-run");
/** --mode sub (default: the Max-sub mode-1 firewall env) | or (mode-2: the OpenRouter Anthropic skin).
 *  The OR key rides OPENROUTER_PROBE_KEY (probe-run plumbing — a scoped test key, never app config). */
const MODE = argValue("--mode") ?? "sub";
// biome-ignore lint/style/noProcessEnv: OPENROUTER_PROBE_KEY is probe-run plumbing (scoped test key), not app config — probes run outside the foundation/env perimeter.
const OR_PROBE_KEY = process.env["OPENROUTER_PROBE_KEY"] ?? "";
if (MODE === "or" && !DRY_RUN && OR_PROBE_KEY.length === 0) {
  throw new Error("--mode or requires OPENROUTER_PROBE_KEY in the environment");
}
/** Probe-run OR tier trio — every tier pinned to haiku so a probe can never accidentally burn
 *  opus-priced credits (mirrors sdk-cache-probe). A real turn derives this from the live catalogs. */
const OR_PROBE_TIER_MODELS = {
  opus: "anthropic/claude-haiku-4.5",
  sonnet: "anthropic/claude-haiku-4.5",
  haiku: "anthropic/claude-haiku-4.5",
} as const;
/** The per-mode firewall env — the SAME builders a real turn uses. */
function probeEnv(
  overrides: Parameters<typeof buildClaudeSdkEnv>[0],
): Record<string, string | undefined> {
  return MODE === "or"
    ? buildClaudeOpenRouterEnv(OR_PROBE_KEY, OR_PROBE_TIER_MODELS, overrides)
    : buildClaudeSdkEnv(overrides);
}
const MODEL = MODEL_FLAG ?? (MODE === "or" ? "anthropic/claude-haiku-4.5" : "claude-haiku-4-5");

// ── Tuning constants ───────────────────────────────────────────────────────────────────────────────────
/** Output cap per turn (CLAUDE_CODE_MAX_OUTPUT_TOKENS) — a two-line codeword summary needs almost nothing.
 *  Held at 256 (not 512) so t2's re-billed prior assistant reply can never, by itself, push the turn-2
 *  cacheWrite across FULL_WRITE_EPS_TOKENS and misread a true prefix hit as "partial" (band false-FAIL). */
const OUTPUT_CAP_TOKENS = 256;
/** Lore paragraphs — sized so the system prompt clears Haiku's cacheable-prefix minimum (4096 tok);
 *  byte-identical to sdk-cache-probe's block so cross-probe runs share the content cache. */
const LORE_PARAGRAPHS = 110;
/** Filler sentences PER CANON ROW (~45 tok each ⇒ ~1.1k tok/row) — the seed zone must dwarf the
 *  write-noise band so a one-row bust is unambiguous in the turn-2 cacheWrite column. */
const CANON_FILLER_SENTENCES = 24;
/** Reply excerpt length in logs/verdicts. */
const SNIPPET = 80;
/** Cost column decimals in the usage table. */
const COST_DECIMALS = 5;
/** turn-2 cacheWrite ≤ this ⇒ only the new tail was billed — a full prefix hit. The tail on t2 is the new
 *  question (~150 tok) PLUS the re-billed prior assistant reply (≤ OUTPUT_CAP_TOKENS = 256) PLUS request
 *  bookkeeping; 800 sits above that sum and still well below one canon filler row (~1.1k tok), so a
 *  single-row seed bust remains unambiguous. (With the old 512-token cap the reply alone could approach
 *  this band — hence the cap drop above.) */
const FULL_WRITE_EPS_TOKENS = 800;
/** turn-2 cacheRead < this ⇒ no cached prefix was reused (below every tier's min cacheable floor). */
const COLD_READ_TOKENS = 1024;
/** The LORE system prefix in tokens. Derived from the sizing above: 110 chronicle paragraphs + the terse
 *  preamble measure ~12.6k Anthropic tokens (byte-identical to sdk-cache-probe's block; a naive chars/4
 *  under-counts prose density). This is the read a FORKED lineage sees when ONLY the system prefix cache-
 *  hits and the entire shared history re-bills — the "system-only masquerade". A live run confirms it: t1's
 *  cacheWrite on a cold lineage is ≈ this + the history, and t2's cacheRead on a system-only hit ≈ this. */
const SYSTEM_PREFIX_TOKENS = 12_600;
/** ~1.5 canon rows (a filler row is ~1.1k tok). The margin between "system prefix only" and "system prefix
 *  + history" reads, sized so a single trailing-row difference can't tip a genuine full hit under the line. */
const HISTORY_READ_MARGIN_TOKENS = 1800;
/** read ≥ this ⇒ the reuse INCLUDED the shared history (a full-prefix hit); read between COLD_READ_TOKENS
 *  and this ⇒ at most the system prefix was reused and the history was re-billed (the system-only case). */
const FULL_PREFIX_READ_TOKENS = SYSTEM_PREFIX_TOKENS + HISTORY_READ_MARGIN_TOKENS;
/** MAX_INJECTION_DEPTH-style over-deep depth — the splice clamps it to the history length, i.e. the TOP
 *  (insertAt 0), the one tail-independent (position-stable across canon growth) in_chat placement. */
const TOP_ANCHOR_DEPTH = 100_000;
/** dry-run spend estimate: ~input tokens touched per live turn (12.6k lore + ~4.6k canon + tail). */
const EST_TOKENS_PER_TURN = 18_000;
/** Role-column pad width in the rendered matrix ("assistant".length). */
const ROLE_PAD = 9;
/** ARM A mini-table column pads (axis name / cell id / cache-class label — "prefix-cached".length). */
const AXIS_PAD = 8;
const A_ID_PAD = 18;
const CLASS_PAD = 13;
/** Every codeword the probe plants (canon rows, the two tail questions, the SIGIL-* injections). */
const CODEWORD_RE =
  /\b(?:ALPHA|BRAVO|CHARLIE|DELTA|ECHO|FOXTROT|SIGIL-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b/g;
const SIGIL_PREFIX = "SIGIL-";

// ── Shared fixtures ────────────────────────────────────────────────────────────────────────────────────

/** Deterministic ~12.6k-token lore block (byte-identical to sdk-cache-probe's — cross-probe cache warmth). */
const LORE = Array.from(
  { length: LORE_PARAGRAPHS },
  (_, i) =>
    `Chronicle ${i}: In the ${i}th year of the Ember Accord, the wardens of Khal-Toruun sealed the obsidian gate beneath the singing dunes, and the caravans learned to route their salt and silver through the high passes of Veyra, where the wind keeps the old names and the toll-keepers keep the older grudges. The ledger of that year records forty-one crossings, three broken oaths, and one dragon sighting that the archivists still dispute.`,
).join("\n");
const STATIC_SYSTEM = `You are a terse lore assistant for the world described below. Answer in one short sentence unless asked otherwise.\n\n${LORE}`;

/** ~1.1k tokens of row-distinct ballast so each canon row is individually visible in cacheWrite deltas. */
function filler(tag: string): string {
  return Array.from(
    { length: CANON_FILLER_SENTENCES },
    (_, i) =>
      `Recollection ${tag}-${i}: the ${tag} caravan logged its ${i}th crossing at the Veyran toll, trading salt-ledgers for amber and paying the wind-tax in old names, as the wardens' ledger of that season duly records.`,
  ).join(" ");
}

interface WireRow {
  role: "user" | "assistant";
  content: string;
}

/** 4 canon rows (ends assistant, so the tail question is the clean user tail). Each row opens with its
 *  positional codeword — the earliest→latest order the tail question asks the model to report. */
const CANON: readonly WireRow[] = [
  { role: "user", content: `Codeword ALPHA. ${filler("alpha")} What did the wardens seal?` },
  {
    role: "assistant",
    content: `Codeword BRAVO. ${filler("bravo")} The wardens sealed the obsidian gate beneath the singing dunes.`,
  },
  {
    role: "user",
    content: `Codeword CHARLIE. ${filler("charlie")} And through whose passes do the caravans route?`,
  },
  {
    role: "assistant",
    content: `Codeword DELTA. ${filler("delta")} The caravans route through the high passes of Veyra.`,
  },
];

const TAIL_QUESTION =
  "Codeword ECHO. Answer with exactly two lines. Line 1: every all-caps codeword you can see anywhere " +
  "in this conversation (bare words like ALPHA and hyphenated SIGIL-… forms), comma-separated, in the " +
  "order each first appears from earliest to latest. Line 2: exactly the word DONE.";
const GROW_TAIL_QUESTION =
  "Codeword FOXTROT. Once more, answer with exactly two lines. Line 1: every all-caps codeword you can " +
  "see anywhere in this conversation, comma-separated, in the order each first appears from earliest to " +
  "latest. Line 2: exactly the word DONE.";

// ── The matrix ─────────────────────────────────────────────────────────────────────────────────────────
/** The deepest matrix depth — well past the last-assistant boundary (mid-seed for every role). */
const DEPTH_DEEP = 4;
const DEPTHS = [0, 1, 2, DEPTH_DEEP] as const;
const ROLES = ["system", "user", "assistant"] as const;
const STABILITIES = ["stable", "volatile"] as const;

interface Cell {
  readonly id: string;
  readonly depth: (typeof DEPTHS)[number];
  readonly role: (typeof ROLES)[number];
  readonly stability: (typeof STABILITIES)[number];
}

const MATRIX: readonly Cell[] = DEPTHS.flatMap((depth) =>
  ROLES.flatMap((role) =>
    STABILITIES.map(
      (stability): Cell => ({ id: `d${depth}-${role}-${stability}`, depth, role, stability }),
    ),
  ),
);

/** The cell's injected codeword — cell-unique so cross-cell content-cache hits can never fake a sighting;
 *  V2 only ever appears on a volatile cell's second turn. */
function sigil(cell: Cell, version: 1 | 2): string {
  return `${SIGIL_PREFIX}${cell.id.toUpperCase()}-${version === 1 ? "ONE" : "TWO"}`;
}
function cellInjection(cell: Cell, turnNo: 1 | 2): ChatInjection {
  const version = cell.stability === "volatile" && turnNo === 2 ? 2 : 1;
  return {
    position: "in_chat",
    depth: cell.depth,
    role: cell.role,
    content: `Codeword ${sigil(cell, version)}. Positional ballast note — keep answering normally.`,
  };
}

/** The codeword that must immediately PRECEDE the sigil in the reported order, per splice position
 *  (withTail = [ALPHA, BRAVO, CHARLIE, DELTA, ECHO-tail]; insertAt = length − depth; assistant@0 floors
 *  to depth 1 — injections.ts). */
const EXPECTED_PREV: Record<number, string> = { 0: "ECHO", 1: "DELTA", 2: "CHARLIE", 4: "ALPHA" };
function expectedPrevCodeword(cell: Cell): string {
  if (cell.depth === 0 && cell.role === "assistant") {
    return "DELTA"; // the assistant@0→1 floor
  }
  return EXPECTED_PREV[cell.depth] ?? "DELTA";
}

// ── The real shaping path (splice → squash → seed/prompt split) ───────────────────────────────────────
interface BuiltTurn {
  readonly seed: readonly SeedTurn[];
  readonly prompt: string;
  /** Did the injection's bytes land in the SEED half (⇒ part of seedSessionId's hash preimage)? */
  readonly injectedInSeed: boolean;
}

/**
 * The pre-dispatch shaping a real send-turn performs, minus name-stamp/macros (single-speaker probe
 * canon has neither). Splice + squash are the PRODUCTION functions. The seed/prompt split MIRRORS
 * `entry/compose/chat.ts` `splitAgentHistory` verbatim (last-assistant boundary; tail joined with
 * AGENT_PROMPT_TAIL_JOINER — the real constant) because importing the compose barrel would drag the whole
 * composition-root module graph (services/sharp/transformers) into a hand-run probe. If splitAgentHistory
 * changes its boundary rule, update this mirror.
 */
function buildShaped(
  canon: readonly WireRow[],
  tailQuestion: string,
  injection: ChatInjection | null,
): BuiltTurn {
  const withTail: WireRow[] = [...canon, { role: "user", content: tailQuestion }];
  const shaped = squashSameRole(
    spliceInChatInjections(withTail, injection === null ? undefined : [injection]),
  );
  let lastAssistant = -1;
  for (let i = shaped.length - 1; i >= 0; i--) {
    if (shaped[i]?.role === "assistant") {
      lastAssistant = i;
      break;
    }
  }
  const tail = shaped.slice(lastAssistant + 1);
  if (tail.length === 0) {
    throw new Error(
      "probe canon must end with a user tail (assistant-final shape is continue-mode)",
    );
  }
  const prompt = tail.map((r) => r.content).join(AGENT_PROMPT_TAIL_JOINER);
  const seed = shaped
    .slice(0, lastAssistant + 1)
    .map((r): SeedTurn => ({ role: r.role, content: r.content }));
  return { seed, prompt, injectedInSeed: seed.some((t) => t.content.includes(SIGIL_PREFIX)) };
}

/** Layer-(a) prediction, FREE (no spawn): does the turn-2 variant hash to a different session lineage? */
function predictSeedChanged(chatId: string, a: BuiltTurn, b: BuiltTurn): boolean {
  return seedSessionId(chatId, toSeedTurns(a.seed)) !== seedSessionId(chatId, toSeedTurns(b.seed));
}

// ── Recording ──────────────────────────────────────────────────────────────────────────────────────────
interface Row {
  readonly scenario: string;
  readonly turn: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly costUsd: number;
  /** Wall-clock ms for the turn. A t1→t2 gap approaching the 5-min cache TTL explains an anomalous cold. */
  readonly elapsedMs: number;
  readonly note: string;
}
const rows: Row[] = [];
const verdicts: { scenario: string; pass: boolean; detail: string }[] = [];

function record(scenario: string, turn: string, t: TurnResult, note = ""): void {
  const r = t.result;
  rows.push({
    scenario,
    turn,
    tokensIn: r.usage.tokensIn,
    tokensOut: r.usage.tokensOut,
    cacheRead: r.usage.cacheReadTokens,
    cacheWrite: r.usage.cacheWriteTokens,
    costUsd: r.usage.costUsd,
    elapsedMs: t.elapsedMs,
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

type CacheClass = "prefix-cached" | "system-only" | "partial" | "cold";
/**
 * The layer-(b) classifier — TWO axes, because write alone cannot tell a cheap fork from an expensive one:
 *
 *   read axis  (how much prefix was REUSED):  read<COLD ⇒ nothing hit; read<FULL_PREFIX ⇒ only the system
 *              prefix hit (history NOT in the read → it was re-billed); read≥FULL_PREFIX ⇒ the read included
 *              the shared history.
 *   write axis (how much was NEWLY billed):   write≤EPS ⇒ only the new tail; write>EPS ⇒ seed-zone re-bill.
 *
 *   cold          read≈0                                — no prefix reused at all.
 *   system-only   COLD ≤ read < FULL_PREFIX, write large — ONLY the ~12.6k system prefix cache-hit while the
 *                 whole shared history re-billed. THE MASQUERADE: write is high and read is nonzero, so a
 *                 write-only classifier files this under "partial" and it reads like a cheap fork — but it is
 *                 the EXPENSIVE fork-is-not-free case the owner warned about. Named so it cannot hide.
 *   prefix-cached read ≥ FULL_PREFIX, write ≤ EPS       — full system+history hit, only the new tail billed.
 *   partial       read ≥ FULL_PREFIX, write > EPS       — the read reached into the history but a mid-history
 *                 bust re-billed some trailing rows (genuinely between full and system-only).
 */
function classify(read: number, write: number): CacheClass {
  if (read < COLD_READ_TOKENS) {
    return "cold";
  }
  if (read < FULL_PREFIX_READ_TOKENS) {
    return "system-only";
  }
  return write <= FULL_WRITE_EPS_TOKENS ? "prefix-cached" : "partial";
}

/** First-appearance codeword order in a reply (the positional signal). */
function codewordOrder(reply: string): string[] {
  const seen: string[] = [];
  for (const m of reply.match(CODEWORD_RE) ?? []) {
    if (!seen.includes(m)) {
      seen.push(m);
    }
  }
  return seen;
}

// ── The turn runner (the real reducer over a real spawn, through the real firewall env) ───────────────
interface TurnSpec {
  readonly prompt: string;
  readonly store: SessionStore;
  readonly resume?: string;
}

interface TurnResult {
  readonly result: ChatResult;
  readonly sessionId: string;
  readonly elapsedMs: number;
}

async function runTurn(spec: TurnSpec): Promise<TurnResult> {
  let sessionId = "";
  const startedAt = Date.now();
  const stream = query({
    prompt: spec.prompt,
    options: {
      // The locked firewall base (mirrors disciplineOptions without needing a branded credential).
      disallowedTools: ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"],
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      settingSources: [],
      env: probeEnv({ maxOutputTokens: OUTPUT_CAP_TOKENS }),
      model: MODEL,
      maxTurns: 1,
      sessionStore: spec.store,
      systemPrompt: STATIC_SYSTEM,
      title: "orbweaver-injection-cache-probe",
      ...(spec.resume !== undefined ? { resume: spec.resume } : {}),
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
  return { result, sessionId, elapsedMs: Date.now() - startedAt };
}

// ── Matrix cells ───────────────────────────────────────────────────────────────────────────────────────
const SAME_LINEAGE = new Set(["resumed", "readopted"]);

interface CellOutcome {
  readonly cell: Cell;
  readonly seedChanged: boolean;
  readonly injectedInSeed: boolean;
  readonly disposition2: string;
  readonly klass: CacheClass;
  readonly t2Read: number;
  readonly t2Write: number;
}
const outcomes: CellOutcome[] = [];

async function runMatrixCell(cell: Cell): Promise<void> {
  const chatId = `probe-inj-${cell.id}`;
  const b1 = buildShaped(CANON, TAIL_QUESTION, cellInjection(cell, 1));
  const b2 = buildShaped(CANON, TAIL_QUESTION, cellInjection(cell, 2));
  const seedChanged = predictSeedChanged(chatId, b1, b2);
  // Fresh store per cell — salt-walk state from another cell's divergence must never leak in.
  const cache = new SessionCache(new InMemorySessionStore());
  const d1 = await cache.ensureSeededSession(chatId, b1.seed);
  const t1 = await runTurn({
    prompt: b1.prompt,
    store: cache.store,
    ...(d1.sessionId !== null ? { resume: d1.sessionId } : {}),
  });
  record(cell.id, "t1", t1, `disp=${d1.disposition}`);
  const d2 = await cache.ensureSeededSession(chatId, b2.seed);
  const t2 = await runTurn({
    prompt: b2.prompt,
    store: cache.store,
    ...(d2.sessionId !== null ? { resume: d2.sessionId } : {}),
  });
  record(cell.id, "t2", t2, `disp=${d2.disposition}`);

  const klass = classify(t2.result.usage.cacheReadTokens, t2.result.usage.cacheWriteTokens);
  // Positional sub-check on the CLEAN turn (t1): the sigil must sit right after its splice neighbor.
  const order1 = codewordOrder(t1.result.reply);
  const sigilAt = order1.indexOf(sigil(cell, 1));
  const prevAt = order1.indexOf(expectedPrevCodeword(cell));
  const posOk = sigilAt >= 0 && prevAt >= 0 && sigilAt === prevAt + 1;
  // Freshness check on t2: the expected version (V2 on volatile) must be visible — a "cache win" that
  // serves stale injected bytes would fail here.
  const expectSigil = sigil(cell, cell.stability === "volatile" ? 2 : 1);
  const sawInjected = t2.result.reply.includes(expectSigil);
  const lineageOk = seedChanged
    ? !SAME_LINEAGE.has(d2.disposition)
    : SAME_LINEAGE.has(d2.disposition);
  // A seed-changed cell's CLASS (partial vs cold — layer (b) on a forked lineage) is the FINDING, not a
  // pass criterion; an unchanged-seed cell must classify prefix-cached.
  const classOk = seedChanged ? true : klass === "prefix-cached";
  outcomes.push({
    cell,
    seedChanged,
    injectedInSeed: b1.injectedInSeed,
    disposition2: d2.disposition,
    klass,
    t2Read: t2.result.usage.cacheReadTokens,
    t2Write: t2.result.usage.cacheWriteTokens,
  });
  verdict(
    cell.id,
    sawInjected && lineageOk && classOk,
    `${cell.id}: inSeed=${b1.injectedInSeed} seedChanged=${seedChanged} disp=[${d1.disposition}→${d2.disposition}] ` +
      `t2 read=${t2.result.usage.cacheReadTokens} write=${t2.result.usage.cacheWriteTokens} class=${klass} ` +
      `saw=${sawInjected}(${expectSigil}) pos@t1=${posOk ? "ok" : `FLAG order=${order1.join(">")}`}`,
  );
}

// ── Grow cells (steady-state: canon grows a real exchange between the turns) ──────────────────────────
interface GrowCell {
  readonly id: string;
  readonly depth: number | null;
  readonly expectSameLineage: boolean;
  readonly note: string;
}
const GROW_CELLS: readonly GrowCell[] = [
  {
    id: "g-none",
    depth: null,
    expectSameLineage: true,
    note: "control: grown canon, no injection — must readopt (the s9 grown-superset machinery)",
  },
  {
    id: "g-d0",
    depth: 0,
    expectSameLineage: false,
    note: "tail note rode turn-1's prompt into the RECORDED user frame but never canon — predicted fork at that user run (cheap: tail-zone re-bill)",
  },
  {
    id: "g-d2",
    depth: 2,
    expectSameLineage: false,
    note: "tail-relative depth MOVES as canon grows — the stored mid-seed note position diverges → predicted fork every turn even with stable bytes",
  },
  {
    id: "g-top",
    depth: TOP_ANCHOR_DEPTH,
    expectSameLineage: true,
    note: "over-deep clamps to the TOP (insertAt 0) — position-stable across growth → predicted readopt (the one lineage-safe deep placement)",
  },
];

function growInjection(depth: number): ChatInjection {
  return {
    position: "in_chat",
    depth,
    role: "user",
    content: `Codeword ${SIGIL_PREFIX}GROW-D${depth}. Standing operator note — keep answering normally.`,
  };
}

async function runGrowCell(g: GrowCell): Promise<void> {
  const chatId = `probe-${g.id}`;
  const inj = g.depth === null ? null : growInjection(g.depth);
  const b1 = buildShaped(CANON, TAIL_QUESTION, inj);
  const cache = new SessionCache(new InMemorySessionStore());
  const d1 = await cache.ensureSeededSession(chatId, b1.seed);
  const t1 = await runTurn({
    prompt: b1.prompt,
    store: cache.store,
    ...(d1.sessionId !== null ? { resume: d1.sessionId } : {}),
  });
  record(g.id, "t1", t1, `disp=${d1.disposition}`);
  // Canon grows the COMMITTED exchange: the bare tail question (injections are transport-side, never
  // canon) + the live reply — exactly the seed production's next turn would render.
  const grown: readonly WireRow[] = [
    ...CANON,
    { role: "user", content: TAIL_QUESTION },
    { role: "assistant", content: t1.result.reply },
  ];
  const b2 = buildShaped(grown, GROW_TAIL_QUESTION, inj);
  const d2 = await cache.ensureSeededSession(chatId, b2.seed);
  const t2 = await runTurn({
    prompt: b2.prompt,
    store: cache.store,
    ...(d2.sessionId !== null ? { resume: d2.sessionId } : {}),
  });
  record(g.id, "t2", t2, `disp=${d2.disposition}`);
  const klass = classify(t2.result.usage.cacheReadTokens, t2.result.usage.cacheWriteTokens);
  const lineageOk = g.expectSameLineage
    ? SAME_LINEAGE.has(d2.disposition)
    : !SAME_LINEAGE.has(d2.disposition);
  // Turn-2 sigil visibility (same guard the matrix cells carry): an injected grow note must still reach the
  // model on the GROWN turn, else a "lineage-safe" verdict could secretly be the note having dropped out of
  // the request. g-none has no injection to see.
  const expectSigil = inj === null ? null : `${SIGIL_PREFIX}GROW-D${g.depth}`;
  const sawInjected = expectSigil === null || t2.result.reply.includes(expectSigil);
  verdict(
    g.id,
    lineageOk && sawInjected,
    `${g.id}: disp=[${d1.disposition}→${d2.disposition}] (want ${g.expectSameLineage ? "resumed/readopted" : "forked/reseeded/seeded"}) ` +
      `t2 read=${t2.result.usage.cacheReadTokens} write=${t2.result.usage.cacheWriteTokens} class=${klass} ` +
      `saw=${expectSigil === null ? "n/a" : `${sawInjected}(${expectSigil})`} — ${g.note}`,
  );
}

// ══ FOLLOWUP SCENARIO ════════════════════════════════════════════════════════════════════════════════
// The first live run (2026-07-10, SDK 0.3.206) proved the content cache is ALL-OR-NOTHING at the
// system/history boundary — every turn-2 cell was either prefix-cached (system+history) or system-only
// (system prefix hit, the ENTIRE ~5.8k shared history re-billed). NO partial hit exists. Two mysteries the
// matrix surfaced and this arm isolates:
//   ARM A — some byte-STABLE, held-lineage cells STILL came back system-only (d0/d1 user-stable, d2
//           system-stable, d2/d4 assistant-stable) while OTHER byte-stable held-lineage cells stayed
//           prefix-cached. Byte-stability + held lineage is necessary but NOT sufficient. Something about
//           the transcript STRUCTURE around the injected row decides. This arm varies ONE structural thing
//           at a time (bytes held stable, lineage held) to name the predictor.
//   ARM B — is the UserPromptSubmit hook (dynamicContextOptions) the cache-safe VOLATILE channel? A 3-turn
//           resumed sequence with DIFFERENT hook content each turn, seeded history byte-identical: does the
//           hook content stay OUT of the lineage (disposition unchanged), keep the history cached, AND reach
//           the model (sigil freshness)? The trifecta that makes it THE dynamic-content spot.

// ── ARM A — stable-cell structural isolation ───────────────────────────────────────────────────────────
// Every A-cell is STABLE (t1 == t2 bytes) and, in isolation, holds its lineage (resumed/readopted expected).
// The FINDING is the layer-(b) class: which cells keep the history cache (prefix-cached) vs drop it
// (system-only), with ONLY the named structural variable differing. The three structural axes, each mapped
// to what the PRODUCTION assembly makes reachable (injections.ts splice + role-squash.ts squash):
//   • bucket   — SEED (hashed history) vs PROMPT (the tail after the last assistant, never hashed). Per the
//                first run, depth-0 user/system land in the PROMPT bucket; depth≥2 land in the SEED. Same
//                byte-stable note, two buckets.
//   • squash   — a user-effective injection ADJACENT to a same-role canon row MERGES into that one frame
//                (squashSameRole) — no new role-run; a role that BREAKS the run (assistant note between two
//                user turns) stays a DISTINCT frame and adds a role boundary. Same depth, merge vs distinct.
//   • wrap     — a system injection converts to user + gets a `[Note from system: …]` wrap AND (being
//                user-effective) merges into an adjacent user row; a bare user note merges the same way but
//                without the wrap text. Isolates whether the wrap bytes / role-conversion matter vs a plain
//                user note at the identical splice point.
interface ACell {
  readonly id: string;
  readonly depth: number;
  readonly role: (typeof ROLES)[number];
  /** The structural axis this cell probes (for the mini-table grouping + the plain-English verdict). */
  readonly axis: "bucket" | "squash" | "wrap";
  readonly note: string;
}
const A_CELLS: readonly ACell[] = [
  // bucket axis — the SAME stable user note, prompt bucket (d0) vs seed bucket (d2). If d0 stays
  // prefix-cached and d2 goes system-only, "landed in the hashed SEED history" is (part of) the predictor.
  {
    id: "a-bucket-prompt",
    depth: 0,
    role: "user",
    axis: "bucket",
    note: "stable user note in the PROMPT bucket (d0, after last assistant — never hashed)",
  },
  {
    id: "a-bucket-seed",
    depth: 2,
    role: "user",
    axis: "bucket",
    note: "stable user note in the SEED bucket (d2, mid-history — hashed, inside the cached prefix)",
  },
  // squash axis — SAME depth (2, seed bucket), user note (merges into the adjacent user canon row → no new
  // role-run) vs assistant note (breaks the user/assistant run → a DISTINCT frame + a role boundary). If the
  // merged one stays prefix-cached and the distinct one goes system-only, "added a role boundary / distinct
  // frame mid-history" is the predictor, not the bytes.
  {
    id: "a-squash-merge",
    depth: 2,
    role: "user",
    axis: "squash",
    note: "stable note that MERGES into an adjacent same-role canon row (no new role-run)",
  },
  {
    id: "a-squash-distinct",
    depth: 2,
    role: "assistant",
    axis: "squash",
    note: "stable note that stays a DISTINCT frame + adds a role boundary (breaks the run)",
  },
  // wrap axis — SAME seed splice point (d2), plain user note vs system note (→ user + `[Note from system:…]`
  // wrap). Both merge into the adjacent user row; isolates whether the wrap/conversion bytes alone flip the
  // class (they should NOT if the predictor is structural role-run shape, not content).
  {
    id: "a-wrap-plain",
    depth: 2,
    role: "user",
    axis: "wrap",
    note: "stable PLAIN user note at the seed splice point (no wrap)",
  },
  {
    id: "a-wrap-system",
    depth: 2,
    role: "system",
    axis: "wrap",
    note: "stable SYSTEM note at the same seed splice point (→ user + [Note from system: …] wrap)",
  },
];

/** A stable (never-changing) injection for an A-cell — the bytes are held identical across t1/t2 so the
 *  ONLY thing that can move the class is the structural axis. Cell-unique sigil so a cross-cell content-cache
 *  hit can't fake a sighting. */
function aInjection(cell: ACell): ChatInjection {
  return {
    position: "in_chat",
    depth: cell.depth,
    role: cell.role,
    content: `Codeword ${SIGIL_PREFIX}${cell.id.toUpperCase()}. Structural-isolation note — keep answering normally.`,
  };
}

interface AOutcome {
  readonly cell: ACell;
  readonly injectedInSeed: boolean;
  readonly disposition2: string;
  readonly klass: CacheClass;
  readonly t2Read: number;
  readonly t2Write: number;
  readonly sawInjected: boolean;
}
const aOutcomes: AOutcome[] = [];

async function runACell(cell: ACell): Promise<void> {
  const chatId = `probe-a-${cell.id}`;
  const inj = aInjection(cell);
  // Byte-stable: the SAME injection on both turns (no V2). The two turns are an identical replay — a held
  // lineage should resume/readopt, and the class is then purely the structural finding.
  const b1 = buildShaped(CANON, TAIL_QUESTION, inj);
  const b2 = buildShaped(CANON, TAIL_QUESTION, inj);
  const cache = new SessionCache(new InMemorySessionStore());
  const d1 = await cache.ensureSeededSession(chatId, b1.seed);
  const t1 = await runTurn({
    prompt: b1.prompt,
    store: cache.store,
    ...(d1.sessionId !== null ? { resume: d1.sessionId } : {}),
  });
  record(cell.id, "t1", t1, `disp=${d1.disposition}`);
  const d2 = await cache.ensureSeededSession(chatId, b2.seed);
  const t2 = await runTurn({
    prompt: b2.prompt,
    store: cache.store,
    ...(d2.sessionId !== null ? { resume: d2.sessionId } : {}),
  });
  record(cell.id, "t2", t2, `disp=${d2.disposition}`);
  const klass = classify(t2.result.usage.cacheReadTokens, t2.result.usage.cacheWriteTokens);
  // The injected sigil must still reach the model on t2 (a "cache win" must not secretly be the note dropping).
  const expectSigil = `${SIGIL_PREFIX}${cell.id.toUpperCase()}`;
  const sawInjected = t2.result.reply.includes(expectSigil);
  // A stable-byte replay MUST hold the lineage; if it forks here the structural read is confounded (flag it).
  const lineageOk = SAME_LINEAGE.has(d2.disposition);
  aOutcomes.push({
    cell,
    injectedInSeed: b1.injectedInSeed,
    disposition2: d2.disposition,
    klass,
    t2Read: t2.result.usage.cacheReadTokens,
    t2Write: t2.result.usage.cacheWriteTokens,
    sawInjected,
  });
  const forkFlag = lineageOk ? "" : " forked-flag (confounds the structural read)";
  verdict(
    cell.id,
    sawInjected && lineageOk,
    `${cell.id} [${cell.axis}]: inSeed=${b1.injectedInSeed} disp=[${d1.disposition} to ${d2.disposition}]${forkFlag} ` +
      `t2 read=${t2.result.usage.cacheReadTokens} write=${t2.result.usage.cacheWriteTokens} class=${klass} ` +
      `saw=${sawInjected}(${expectSigil}) — ${cell.note}`,
  );
}

/** Render one structural axis's two cells + the FLIP verdict (did varying that axis alone move the class). */
function renderAxisGroup(axis: string, cells: readonly AOutcome[]): void {
  console.log(`  axis=${axis.padEnd(AXIS_PAD)}`);
  for (const o of cells) {
    console.log(
      `    ${o.cell.id.padEnd(A_ID_PAD)} inSeed=${o.injectedInSeed ? "Y" : "n"} class=${o.klass.padEnd(CLASS_PAD)} r${o.t2Read}/w${o.t2Write} disp=${o.disposition2} saw=${o.sawInjected}`,
    );
  }
  const classes = new Set(cells.map((c) => c.klass));
  const flipped = classes.has("prefix-cached") && classes.has("system-only");
  const detail = flipped
    ? "MOVED the history-cache class ⇒ this is a structural predictor"
    : "did NOT move the class (this axis is not the predictor, or was confounded — check the fork flags)";
  console.log(`    → ${flipped ? "FLIPPED" : "no flip"}: varying ${axis} alone ${detail}`);
}

/** The mini-table + plain-English verdict: for each structural axis, the two cells side by side and whether
 *  the axis FLIPPED the class (prefix-cached ↔ system-only) with only that variable differing. */
function renderArmA(): void {
  if (aOutcomes.length === 0) {
    return;
  }
  console.log("\n=== ARM A — stable-cell structural isolation (bytes held, lineage held) ===");
  const byAxis = new Map<string, AOutcome[]>();
  for (const o of aOutcomes) {
    const bucket = byAxis.get(o.cell.axis);
    if (bucket === undefined) {
      byAxis.set(o.cell.axis, [o]);
    } else {
      bucket.push(o);
    }
  }
  for (const [axis, cells] of byAxis) {
    renderAxisGroup(axis, cells);
  }
  const seedSystemOnly = aOutcomes.filter((o) => o.injectedInSeed && o.klass === "system-only");
  const seedCached = aOutcomes.filter((o) => o.injectedInSeed && o.klass === "prefix-cached");
  const promptCached = aOutcomes.filter((o) => !o.injectedInSeed && o.klass === "prefix-cached");
  console.log(
    `  VERDICT — of the SEED-bucket stable cells: ${seedCached.length} stayed prefix-cached, ${seedSystemOnly.length} went system-only; ` +
      `PROMPT-bucket stable cells prefix-cached: ${promptCached.length}. ` +
      "The structural var(s) that FLIPPED above name 'history stays cached'; a SEED cell that stays cached " +
      "while another SEED cell of the same bytes goes system-only proves the predictor is STRUCTURE, not the note bytes.",
  );
}

// ── ARM B — the hook channel (dynamic content spot) ────────────────────────────────────────────────────
// dynamicContextOptions (agent-sdk barrel) returns the UserPromptSubmit hook wiring whose `additionalContext`
// the runtime injects adjacent to the user prompt (a mid-conversation operator-context seam). Prove the
// trifecta: across 3 resumed turns each carrying DIFFERENT hook content (volatile) over a byte-IDENTICAL
// seeded history —
//   • lineage-neutral: the seed hash / disposition does NOT change (the hook body stays OUT of the seed).
//   • cache-safe:      the history stays prefix-cached despite the volatile hook content each turn.
//   • content-visible: the model ECHOES each turn's distinct hook sigil (the hook is actually read).
// Also: does the hook content ENTER the recorded transcript? We compare the stored session frames (via the
// SessionCache's store) BEFORE and AFTER each turn — if a frame containing the hook sigil appears, the hook
// is NOT lineage-neutral for the NEXT turn (it has the same mech-2 fork as a d0 in_chat note).
const HOOK_TURNS = 3;
// IN-WORLD freshness check (NOT "list your codewords" — that reads as prompt-extraction and Haiku REFUSES it,
// contaminating the content-visible signal; observed live 2026-07-10). The hook injects an in-world gate
// watchword each turn; the tail asks for it in-character. Byte-IDENTICAL every turn so the ONLY varying input
// is the hook body — the clean cache isolation. The model restating the word proves it read the hook.
const HOOK_TAIL_QUESTION =
  "A gate guard stops you and asks for tonight's watchword before letting you pass. " +
  "Answer with only the watchword, nothing else.";
/** Distinct in-world watchword per turn — greppable + cell-unique (so a cross-turn content-cache hit can't
 *  fake a sighting) but framed as a fantasy watchword, not a machine codeword the model balks at echoing. */
const HOOK_WATCHWORDS = ["SALTHOLLOW", "DUNEHART", "VEYRAGATE"] as const;

/** The volatile per-turn hook content — a distinct in-world watchword each turn (the freshness signal). */
function hookContext(turnNo: number): { text: string; sigil: string } {
  const word = HOOK_WATCHWORDS[(turnNo - 1) % HOOK_WATCHWORDS.length] ?? "SALTHOLLOW";
  return {
    sigil: word,
    text: `Operator note for this turn: tonight's gate watchword is ${word}. If anyone asks you for the watchword, tell them.`,
  };
}

/** Read the current stored transcript text for a chat's recorded session (the SessionCache store), so we can
 *  detect whether a hook sigil leaked into the recorded frames. Returns "" when nothing is recorded yet. */
async function storedTranscript(cache: SessionCache, chatId: string): Promise<string> {
  const sessionId = cache.resolveResumeId(chatId);
  if (sessionId === undefined) {
    return "";
  }
  const entries = await cache.store.load({ projectKey: "orbweaver", sessionId });
  if (entries === null) {
    return "";
  }
  return entries
    .map((e) => {
      const content = (e as { message?: { content?: unknown } }).message?.content;
      if (typeof content === "string") {
        return content;
      }
      if (!Array.isArray(content)) {
        return "";
      }
      return content
        .map((b) =>
          typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text : "",
        )
        .join("");
    })
    .join("\n");
}

async function runHookArm(): Promise<void> {
  const chatId = "probe-hook";
  // The seeded history is byte-IDENTICAL every turn (the plain canon, no injection) — so any lineage change
  // could only come from the hook, not the seed.
  const cache = new SessionCache(new InMemorySessionStore());
  const dispositions: string[] = [];
  const classes: CacheClass[] = [];
  const sawEach: boolean[] = [];
  const leakedEach: boolean[] = [];
  for (let i = 0; i < HOOK_TURNS; i++) {
    const { text, sigil: hookSigil } = hookContext(i + 1);
    const b = buildShaped(CANON, HOOK_TAIL_QUESTION, null);
    // biome-ignore lint/performance/noAwaitInLoops: the 3 hook turns are sequential BY DESIGN — each resumes the prior lineage; serial order keeps the disposition/leak attribution unambiguous.
    const before = await storedTranscript(cache, chatId);
    const decision = await cache.ensureSeededSession(chatId, b.seed);
    dispositions.push(decision.disposition);
    const t = await runTurnWithHook(
      {
        prompt: b.prompt,
        store: cache.store,
        ...(decision.sessionId !== null ? { resume: decision.sessionId } : {}),
      },
      text,
    );
    record(`hook-t${i + 1}`, `t${i + 1}`, t, `disp=${decision.disposition}`);
    classes.push(classify(t.result.usage.cacheReadTokens, t.result.usage.cacheWriteTokens));
    sawEach.push(t.result.reply.includes(hookSigil));
    const after = await storedTranscript(cache, chatId);
    // Leak = the hook sigil appears in the recorded frames that were NOT there before this turn.
    leakedEach.push(!before.includes(hookSigil) && after.includes(hookSigil));
  }
  // Trifecta: lineage-neutral (every turn after the first resumes/readopts — the hook did NOT fork the
  // lineage), cache-safe (every resumed turn prefix-cached), content-visible (each turn's sigil echoed).
  const lineageNeutral = dispositions.slice(1).every((d) => SAME_LINEAGE.has(d));
  const cacheSafe = classes.slice(1).every((k) => k === "prefix-cached");
  const contentVisible = sawEach.every((s) => s);
  const anyLeak = leakedEach.some((l) => l);
  verdict(
    "hook",
    lineageNeutral && cacheSafe && contentVisible && !anyLeak,
    `hook trifecta: lineage-neutral=${lineageNeutral} (disp=${dispositions.join(">")}) ` +
      `cache-safe=${cacheSafe} (class=${classes.join(">")}) content-visible=${contentVisible} (saw=${sawEach.join(",")}) ` +
      `transcript-leak=${anyLeak} (per-turn=${leakedEach.join(",")}) — ` +
      `${lineageNeutral && cacheSafe && contentVisible && !anyLeak ? "the hook IS the cache-safe volatile channel" : "hook FAILS one leg — see above"}`,
  );
}

/** runTurn + the dynamicContextOptions hook merged into the SDK options. Kept separate from `runTurn` so the
 *  matrix/grow/ARM-A paths stay hook-free (the hook is ARM B's variable). */
async function runTurnWithHook(spec: TurnSpec, hookText: string): Promise<TurnResult> {
  let sessionId = "";
  const startedAt = Date.now();
  const hookOpts = dynamicContextOptions(hookText);
  const stream = query({
    prompt: spec.prompt,
    options: {
      disallowedTools: ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"],
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      settingSources: [],
      env: probeEnv({ maxOutputTokens: OUTPUT_CAP_TOKENS }),
      model: MODEL,
      maxTurns: 1,
      sessionStore: spec.store,
      systemPrompt: STATIC_SYSTEM,
      title: "orbweaver-injection-cache-probe",
      ...(spec.resume !== undefined ? { resume: spec.resume } : {}),
      ...hookOpts,
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
  return { result, sessionId, elapsedMs: Date.now() - startedAt };
}

// ── Plan / dry-run ─────────────────────────────────────────────────────────────────────────────────────
function printPlan(mCells: readonly Cell[], gCells: readonly GrowCell[]): void {
  const totalTurns = (mCells.length + gCells.length) * 2;
  console.log(
    `PLAN — ${mCells.length} matrix cells + ${gCells.length} grow cells, 2 turns each = ${totalTurns} live turns ` +
      `(~${EST_TOKENS_PER_TURN} input tok touched/turn, mostly cache-read after t1; ⚠ real ${MODE === "or" ? "OR credits" : "Max-sub quota"})`,
  );
  console.log(
    "  deterministic layer-(a) predictions (FREE — seedSessionId is a pure content hash):",
  );
  for (const cell of mCells) {
    const chatId = `probe-inj-${cell.id}`;
    const b1 = buildShaped(CANON, TAIL_QUESTION, cellInjection(cell, 1));
    const b2 = buildShaped(CANON, TAIL_QUESTION, cellInjection(cell, 2));
    const seedChanged = predictSeedChanged(chatId, b1, b2);
    const predicted = seedChanged
      ? "fork → measure the re-bill (partial vs cold)"
      : "resume/readopt → prefix-cached";
    console.log(
      `  ${cell.id}: inSeed=${b1.injectedInSeed} t2SeedChanged=${seedChanged} → predict ${predicted}`,
    );
  }
  for (const g of gCells) {
    console.log(
      `  ${g.id}: predict ${g.expectSameLineage ? "readopt (position-stable)" : "fork (position drift)"} — ${g.note}`,
    );
  }
}

// ── Result rendering ───────────────────────────────────────────────────────────────────────────────────
function fmtOutcome(o: CellOutcome | undefined): string {
  return o === undefined ? "—" : `${o.klass}(r${o.t2Read}/w${o.t2Write}/${o.disposition2})`;
}

function renderMatrix(): void {
  if (outcomes.length === 0) {
    return;
  }
  console.log("\n=== turn-2 outcome by depth × role (stable | volatile) ===");
  for (const depth of DEPTHS) {
    for (const role of ROLES) {
      const s = outcomes.find(
        (o) => o.cell.depth === depth && o.cell.role === role && o.cell.stability === "stable",
      );
      const v = outcomes.find(
        (o) => o.cell.depth === depth && o.cell.role === role && o.cell.stability === "volatile",
      );
      console.log(
        `  d${depth} ${role.padEnd(ROLE_PAD)} stable=${fmtOutcome(s)}  volatile=${fmtOutcome(v)}`,
      );
    }
  }
}

function headline(): void {
  if (outcomes.length === 0) {
    return;
  }
  const sameLineage = outcomes.filter((o) => !o.seedChanged);
  const sameFull = sameLineage.filter((o) => o.klass === "prefix-cached").length;
  const busted = outcomes.filter((o) => o.seedChanged);
  // system-only among the FORKED cells is the expensive-fork signal — a fork that dropped the whole shared
  // history from the cache read (only the system prefix survived), NOT a cheap tail re-bill. Surface it.
  const systemOnly = busted.filter((o) => o.klass === "system-only").length;
  const perDepth = DEPTHS.map((d) => {
    const cells = busted.filter((o) => o.cell.depth === d);
    if (cells.length === 0) {
      return `d${d}=n/a`;
    }
    const avg = Math.round(cells.reduce((n, o) => n + o.t2Write, 0) / cells.length);
    return `d${d}≈${avg}tok(${cells.map((o) => o.klass).join(",")})`;
  }).join(" · ");
  console.log(
    "\nHEADLINE — lineage-safe cells (seed hash unchanged: stable ANY depth, volatile d0/d1 user|system): " +
      `${sameFull}/${sameLineage.length} prefix-cached ⇒ depth injection coexists with caching exactly while ` +
      "the SEED bytes hold still. Seed-changing cells (volatile assistant@0/1, volatile any-role@2/4): " +
      `re-bill per depth (t2 cacheWrite) ${perDepth}. ` +
      `⚠ ${systemOnly}/${busted.length} forked cells classed SYSTEM-ONLY (only the ~${SYSTEM_PREFIX_TOKENS}-tok ` +
      "system prefix hit, the ENTIRE shared history re-billed) — that is the EXPENSIVE fork, not a cheap tail " +
      "re-bill; any nonzero count means a fork here is NOT free and the cheap-fork options are falsified for that " +
      "cell. Grow cells tell the steady-state (see their verdicts): tail-relative depth is predicted to fork " +
      "EVERY turn as canon grows — only the top-anchored placement holds a lineage.",
  );
}

/** The shared usage table both the matrix run and the followup run print. */
function printUsageTable(): void {
  console.log("\n=== usage table ===");
  console.table(
    rows.map((r) => ({
      scenario: `${r.scenario}/${r.turn}`,
      in: r.tokensIn,
      out: r.tokensOut,
      cacheRead: r.cacheRead,
      cacheWrite: r.cacheWrite,
      cost: r.costUsd.toFixed(COST_DECIMALS),
      ms: r.elapsedMs,
      note: r.note,
    })),
  );
}

// ── Followup scenario driver ─────────────────────────────────────────────────────────────────────────
function printFollowupPlan(aCells: readonly ACell[]): void {
  const totalTurns = aCells.length * 2 + HOOK_TURNS;
  console.log(
    `PLAN [followup] — ARM A: ${aCells.length} structural-isolation cells × 2 turns; ARM B: 1 hook arm × ${HOOK_TURNS} turns ` +
      `= ${totalTurns} live turns (~${EST_TOKENS_PER_TURN} input tok touched/turn, mostly cache-read; ⚠ real ${MODE === "or" ? "OR credits" : "Max-sub quota"})`,
  );
  console.log(
    "  ARM A — bytes held stable + lineage held; the FINDING is the layer-(b) class per axis:",
  );
  for (const cell of aCells) {
    const b = buildShaped(CANON, TAIL_QUESTION, aInjection(cell));
    // A stable replay never changes the seed, so the layer-(a) prediction is always resume/readopt; the
    // free signal here is the BUCKET (does the note land in the hashed seed?).
    console.log(
      `  ${cell.id} [${cell.axis}]: inSeed=${b.injectedInSeed} → predict resume/readopt; class is the finding — ${cell.note}`,
    );
  }
  console.log(
    "  ARM B — hook channel: predict lineage-neutral (hook body stays out of the seed) + prefix-cached " +
      "every turn + each turn's SIGIL-HOOK-T{n} echoed; transcript-leak predicted NO.",
  );
}

async function runFollowup(): Promise<void> {
  const aCells = A_CELLS.filter((c) => ONLY.size <= 1 || ONLY.has(c.id));
  const runHook = ONLY.size <= 1 || ONLY.has("hook");
  printFollowupPlan(aCells);
  if (DRY_RUN) {
    console.log("\n--dry-run: no turns spawned.");
    return;
  }
  for (const cell of aCells) {
    console.log(`── ${cell.id} ──`);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: cells are sequential BY DESIGN — quota-metered live turns; serial order keeps cache-metric attribution unambiguous.
      await runACell(cell);
    } catch (error) {
      verdict(cell.id, false, `threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (runHook) {
    console.log("── hook ──");
    try {
      await runHookArm();
    } catch (error) {
      verdict("hook", false, `threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  printUsageTable();
  renderArmA();
  const failed = verdicts.filter((v) => !v.pass);
  console.log(`\n${verdicts.length - failed.length}/${verdicts.length} followup checks passed`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(
    `sdk-injection-cache-probe — model=${MODEL} (${MODE === "or" ? "mode-2 OR skin" : "mode-1 Max sub"}; spends real quota/credits)\n`,
  );
  if (FOLLOWUP) {
    await runFollowup();
    return;
  }
  await runMatrix();
}

/** The default (matrix + grow) run — extracted from `main` so the scenario dispatch stays thin. */
async function runMatrix(): Promise<void> {
  const mCells = MATRIX.filter((c) => ONLY.size === 0 || ONLY.has(c.id));
  const gCells = GROW_CELLS.filter((g) => ONLY.size === 0 || ONLY.has(g.id));
  printPlan(mCells, gCells);
  if (DRY_RUN) {
    console.log("\n--dry-run: no turns spawned.");
    return;
  }
  for (const cell of mCells) {
    console.log(`── ${cell.id} ──`);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: cells are sequential BY DESIGN — quota-metered live turns; serial order keeps cache-metric attribution unambiguous.
      await runMatrixCell(cell);
    } catch (error) {
      verdict(cell.id, false, `threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const g of gCells) {
    console.log(`── ${g.id} ──`);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: same sequential-by-design discipline as the matrix cells.
      await runGrowCell(g);
    } catch (error) {
      verdict(g.id, false, `threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  printUsageTable();
  renderMatrix();
  headline();
  const failed = verdicts.filter((v) => !v.pass);
  console.log(`\n${verdicts.length - failed.length}/${verdicts.length} cell checks passed`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

await main();
