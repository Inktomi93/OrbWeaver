#!/usr/bin/env tsx
/**
 * pnpm sdk:anth-direct-cache-probe [--arm anth-direct,or-chat] [--model <or-slug>] [--turns <n>] [--verbose]
 *
 * THE DUAL-ARM CACHE-CORRECTNESS ACCEPTANCE PROBE (04 W9 / §1a acceptance tier). The hand-run live receipt
 * that a cache-touching wave (W3/W4/W8/W9) cannot "finish" without: real `cache_read_input_tokens` hits
 * where the design says they land. It spends REAL OpenRouter quota on the OR-key Anthropic skin — it is a
 * HAND-RUN probe, NEVER CI, and the orchestrator runs it with the scoped key. The key rides
 * OPENROUTER_PROBE_KEY (probe-run plumbing — a scoped test key, never app config).
 *
 * WHY TWO ARMS — the ONE cache physics, both wires that place OUR domain-computed R1 PAIR:
 *   • anth-direct — the `@anthropic-ai/sdk` Messages client on the OR base (`openrouter.ai/api/v1/messages`,
 *     the anth-direct v1 PRIMARY path, part 02 §4): WE build the messages array + place `cache_control` at the
 *     PAIR (`depth` AND `depth+2`). Cache tokens are read through the SAME `reduceAnthStream` reducer a real
 *     anth-direct turn uses — so the probe reads the EXACT numbers the `provider.cache` event carries
 *     (`usage.cache_read_input_tokens`/`cache_creation_input_tokens`).
 *   • or-chat — the `@openrouter/sdk` chat-completions wire with per-part `cacheControl` (the openrouter
 *     backend's cache path): the same rolling PAIR, emitted in the OpenAI-compat dialect. Cache tokens are
 *     read from `usage.promptTokensDetails.cachedTokens`/`cacheWriteTokens` — the SAME fields the OR runner's
 *     `provider.cache` receipt reads.
 *
 * THE LOAD-BEARING PROOF — THE 20-BLOCK LOOKBACK (part 02 §5d): Anthropic checks at most 20 message
 * positions back per breakpoint. On a LONG conversation the tail grows past a single breakpoint's reach, so a
 * lone `depth` breakpoint STOPS being read and the whole prefix re-bills. The R1 PAIR pins BOTH `depth` and
 * `depth+2`, keeping a hit inside the window as the tail grows (the deeper block sits on already-cached
 * stable content, so the second read is FREE). The probe builds a conversation long enough that `depth` sits
 * >20 blocks from the tail, runs the SINGLE-breakpoint control vs the PAIR, and shows the PAIR keeps
 * `cacheRead > 0` where the single drops to a cold re-bill. THAT is the receipt the design rests on.
 *
 * ALSO MEASURED (the resolver-seeding matrix — the fact that opens the part 03 §3 anth-direct sampling +
 * prefill entries):
 *   • prefill on/off PER MODEL — a trailing assistant message continued (✓) vs a HARD 400 (✗). opus-4.5 /
 *     haiku-4.5 expected ✓; opus-4.8 / sonnet-4.6 expected ✗ (the live matrix, part 01 §1a). This gates
 *     `turns.assistantPrefill` per (model × direct transport).
 *   • mid-conv-system placement — a trailing `role:"system"` message after the last user turn HONORED
 *     (operator authority) on Opus 4.8, not on Haiku (part 01 §2). This gates `turns.midConversationSystem`.
 *   • the SAMPLING honor matrix — temperature (Anthropic 0–1) / top_p / top_k per model: does a non-default
 *     value return 200 (honored) or 400 ("Models released after Claude Opus 4.6 do not support setting …")?
 *     A 200 across the trio OPENS that model's `ANTH_DIRECT_SAMPLING` entry in the resolver (turns.ts);
 *     seeded fail-closed `{}` until this probe confirms it (part 03 §3 — a blanket unlock is a 400 factory).
 *
 * DO NOT RUN in CI. Costs real OR credits; needs OPENROUTER_PROBE_KEY. Every scenario prints RESULT-line
 * receipts (per-turn cacheRead/cacheWrite) + a PASS/FAIL verdict. Re-run after any `@anthropic-ai/sdk` bump.
 */

import process from "node:process";
import type { MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AnthClient } from "@orb/server/infra/providers/backends/anth-direct";
import { createFirstPartyAnthClient, createOpenRouterAnthClient, reduceAnthStream } from "@orb/server/infra/providers/backends/anth-direct";
import { createOpenRouterClient } from "@orb/server/infra/providers/backends/openrouter";

// Durability: pick up the *_PROBE_KEY vars from the repo-root `.env` (gitignored) so a re-run is one command
// with no manual export. Node's built-in loader (no dotenv dep); absent `.env` is fine — the keys can also
// come straight from the shell env, so a missing file is not an error.
try {
  process.loadEnvFile();
} catch {
  // No `.env` at cwd — fall back to whatever the shell already exported.
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const VERBOSE = args.includes("--verbose");
/** Which scenarios to run (default: all). Lets a per-model SAMPLING sweep skip the expensive lookback proof
 *  (`--scenario sampling`) — the lookback physics is model-agnostic, so one validation run suffices. */
const SCENARIOS = new Set(
  (
    argValue("--scenario")
      ?.split(",")
      .map((s) => s.trim()) ?? ["lookback", "prefill", "mid-conv-system", "sampling"]
  ).filter((s) => s.length > 0),
);
/** Which arms to run. `anth-direct` = the OR-skin Messages wire; `or-chat` = the OpenAI-compat wire;
 *  `anth-first-party` = the DIRECT `api.anthropic.com` wire (W11) — the ONLY arm that reflects raw Anthropic
 *  per-model sampling validation (the OR skin transforms params: it validates temperature against the OpenAI
 *  0–2 range, so its 200s do NOT prove Anthropic honor — proven 2026-07-17). Default: the two OR arms. */
const ARMS = new Set(
  (
    argValue("--arm")
      ?.split(",")
      .map((a) => a.trim()) ?? ["anth-direct", "or-chat"]
  ).filter((a) => a.length > 0),
);
// biome-ignore lint/style/noProcessEnv: the *_PROBE_KEY vars are probe-run plumbing (scoped test keys), not app config — probes run outside the foundation/env perimeter.
const OR_PROBE_KEY = process.env["OPENROUTER_PROBE_KEY"] ?? "";
// biome-ignore lint/style/noProcessEnv: see above — the first-party arm's Anthropic `sk-ant-…` key.
const ANTHROPIC_PROBE_KEY = process.env["ANTHROPIC_PROBE_KEY"] ?? "";
const NEEDS_OR_KEY = ARMS.has("anth-direct") || ARMS.has("or-chat");
if (NEEDS_OR_KEY && OR_PROBE_KEY.length === 0) {
  throw new Error("the anth-direct / or-chat arms require OPENROUTER_PROBE_KEY in the environment");
}
if (ARMS.has("anth-first-party") && ANTHROPIC_PROBE_KEY.length === 0) {
  throw new Error("the anth-first-party arm requires ANTHROPIC_PROBE_KEY (an Anthropic sk-ant-… key) in the environment");
}

/** The default cache-arm model — Haiku (cheap; ~4096-tok min cacheable floor, so the lore clears it). A real
 *  matrix run overrides per model for the prefill/sampling honor sweep. OR version-only slug. */
const DEFAULT_MODEL = argValue("--model") ?? "anthropic/claude-haiku-4.5";

// ── Tuning constants (named — noMagicNumbers) ────────────────────────────────────────────────────────────
/** Output cap per turn — keeps every probe reply tiny. */
const OUTPUT_CAP_TOKENS = 256;
/** Lore paragraphs — sized so the system prompt clears Haiku's cacheable-prefix minimum (4096 tok); byte-
 *  identical to sdk-cache-probe's block so cross-probe runs share the content cache. */
const LORE_PARAGRAPHS = 110;
/** Filler sentences per canon row (~45 tok each ⇒ ~1.1k tok/row) — each row is individually visible in the
 *  cacheWrite column, and enough rows push `depth` past the 20-block lookback window. */
const CANON_FILLER_SENTENCES = 24;
/** History exchange rows for the LONG-conversation lookback proof. >20 message blocks so a lone `depth`
 *  breakpoint at the stable prefix sits outside Anthropic's 20-position lookback and stops being read. */
const LONG_HISTORY_ROWS = 28;
/** The rolling breakpoint's offset-from-end (SHAPE computes this in production; the probe pins a stable value
 *  that lands the PAIR deep in the cached prefix, >20 blocks from the tail on the long conversation). */
const ROLLING_OFFSET_FROM_END = 24;
/** The PAIR's second breakpoint is `depth + PAIR_GAP` from end (R1 — part 02 §5d). */
const PAIR_GAP = 2;
/** Reply excerpt length in logs/verdicts. */
const SNIPPET = 80;
/** turn-2 cacheRead below this ⇒ no cached prefix reused (below every tier's min cacheable floor). */
const COLD_READ_TOKENS = 1024;
/** History rows kept as the shared prefix for the honor-matrix scenarios (prefill/mid-conv/sampling) — a few
 *  canon rows before the tail; small so the honor turn is cheap (the cache proof owns the long history). */
const HONOR_PREFIX_ROWS = 4;
/** Rows kept before the sampling tail (even smaller — sampling honor is a pure 200-vs-400 wire check). */
const SAMPLING_PREFIX_ROWS = 2;
/** Recall matcher for the mid-conv-system operator note (top-level per useTopLevelRegex). */
const MARLA_RE = /marla/i;

/** The ephemeral 5-min cache_control directive — the SAME shape the anth-direct request builder pins
 *  (kit ANTHROPIC_CACHE_5M). Named here so the probe body matches the runner's wire byte-for-byte. */
const CACHE_5M = { type: "ephemeral" } as const;
const TEXT = "text" as const;

// ── Shared fixtures ────────────────────────────────────────────────────────────────────────────────────
/** Deterministic ~12.6k-token lore block (byte-identical to the sibling probes — cross-probe cache warmth). */
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
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** A LONG alternating user/assistant history (ends on assistant so the tail question is a clean user tail).
 *  Long enough that the rolling `depth` breakpoint sits >20 message blocks from the tail. */
function longHistory(): WireRow[] {
  const rows: WireRow[] = [];
  for (let i = 0; i < LONG_HISTORY_ROWS; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    rows.push({ role, content: `Turn ${i}. ${filler(`t${i}`)}` });
  }
  // Guarantee the last row is assistant (so appending a user tail is clean).
  if (rows.at(-1)?.role !== "assistant") {
    rows.push({ role: "assistant", content: `Turn ${rows.length}. ${filler(`t${rows.length}`)}` });
  }
  return rows;
}

// ── Recording ──────────────────────────────────────────────────────────────────────────────────────────
interface Row {
  readonly arm: string;
  readonly scenario: string;
  readonly turn: string;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly note: string;
}
const rows: Row[] = [];
const verdicts: { scenario: string; pass: boolean; detail: string }[] = [];

/** THE RESULT-LINE receipt (the recon's probe contract): per-turn cacheRead/cacheWrite, greppable. */
function result(cell: { arm: string; scenario: string; turn: string; r: CacheReadout; note?: string }): void {
  const { arm, scenario, turn, r } = cell;
  const note = cell.note ?? "";
  rows.push({ arm, scenario, turn, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite, note });
  console.log(`RESULT ${arm}/${scenario}/${turn} cacheRead=${r.cacheRead} cacheWrite=${r.cacheWrite}${note ? ` ${note}` : ""}`);
  if (VERBOSE && r.reply !== undefined) {
    console.log(`  reply: ${r.reply.slice(0, SNIPPET * 2)}`);
  }
}

function verdict(scenario: string, pass: boolean, detail: string): void {
  verdicts.push({ scenario, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"} — ${detail}`);
}

/** The one shape both arms reduce to — the SAME numbers each backend's `provider.cache` event carries. */
interface CacheReadout {
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly reply?: string;
  /** Set when the wire rejected the turn (a 400/… — the prefill/sampling honor signal). */
  readonly errorStatus?: number;
  readonly errorMessage?: string;
}

// ═══ ARM: anth-direct (the @anthropic-ai/sdk Messages wire on the OR base) ══════════════════════════════

/** Build the SDK `system` param: the static prefix pinned with cache_control (breakpoint #1 — the stable
 *  prefix), matching the anth-direct request builder's `buildSystem`. */
function anthSystem(): TextBlockParam[] {
  return [{ type: TEXT, text: STATIC_SYSTEM, cache_control: CACHE_5M }];
}

/** Turn a wire row → a Messages `MessageParam`. */
function toAnthParam(row: WireRow): MessageParam {
  return { role: row.role, content: row.content };
}

/** Pin `cache_control` at the given offsets-from-end (the R1 pair, or a single control), re-expressing the
 *  string content as a single cache_control-bearing text block — EXACTLY the anth-direct `buildMessages`
 *  placement (same dialect, same indices). */
function placeAnthBreakpoints(messages: MessageParam[], offsetsFromEnd: readonly number[]): void {
  for (const offset of offsetsFromEnd) {
    const idx = messages.length - 1 - offset;
    const target = messages[idx];
    if (target !== undefined && typeof target.content === "string") {
      messages[idx] = {
        role: target.role,
        content: [{ type: TEXT, text: target.content, cache_control: CACHE_5M }],
      };
    }
  }
}

interface AnthTurnSpec {
  readonly model: string;
  readonly history: readonly WireRow[];
  /** Offsets-from-end to pin cache_control at (empty = no history breakpoint; [d] = single; [d, d+2] = pair). */
  readonly breakpoints: readonly number[];
  /** Append a trailing `role:"system"` message after the last user turn (the mid-conv-system placement). */
  readonly midConvSystem?: string;
  /** Sampling knobs to send (the honor-matrix probe — a 400 means the model rejects the non-default value). */
  readonly sampling?: { temperature?: number; top_p?: number; top_k?: number };
  /** The belted SDK client to run through — defaults to the OR-skin client; the first-party arm passes the
   *  `api.anthropic.com` client (W11) so the honor matrix reflects RAW Anthropic validation, not OR's. */
  readonly client?: AnthClient;
}

/** Run ONE anth-direct turn through the real belted client + the real `reduceAnthStream` reducer, so the
 *  cache numbers are the exact ones a production `provider.cache` event carries. Returns a normalized readout
 *  (or the error status/message when the wire rejects the turn — the prefill/sampling honor signal). */
async function anthTurn(spec: AnthTurnSpec): Promise<CacheReadout> {
  const client = spec.client ?? createOpenRouterAnthClient(OR_PROBE_KEY);
  const messages = spec.history.map(toAnthParam);
  placeAnthBreakpoints(messages, spec.breakpoints);
  if (spec.midConvSystem !== undefined) {
    messages.push({ role: "system", content: spec.midConvSystem } as unknown as MessageParam);
  }
  const startedAt = Date.now();
  try {
    const stream = await client.messages.create({
      model: spec.model,
      max_tokens: OUTPUT_CAP_TOKENS,
      messages,
      system: anthSystem(),
      stream: true,
      ...(spec.sampling ?? {}),
    });
    const reduced = await reduceAnthStream(stream, {
      chatId: castId<ChatId>("probe-anth"),
      startedAt,
      now: () => Date.now(),
    });
    return {
      cacheRead: reduced.cacheReadTokens,
      cacheWrite: reduced.cacheWriteTokens,
      reply: reduced.reply,
    };
  } catch (err) {
    return errorReadout(err);
  }
}

// ═══ ARM: or-chat (the @openrouter/sdk chat-completions wire, per-part cacheControl) ═══════════════════

/** The OR chat content-text block dialect with the per-part cache directive (the openrouter backend's
 *  `cacheControlBlock` shape). */
function orCacheBlock(text: string): { type: "text"; text: string; cacheControl: typeof CACHE_5M } {
  return { type: TEXT, text, cacheControl: CACHE_5M };
}

interface OrMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string | ReturnType<typeof orCacheBlock>[];
}

interface OrTurnSpec {
  readonly model: string;
  readonly history: readonly WireRow[];
  readonly breakpoints: readonly number[];
}

/** Run ONE OR chat-completions turn (streaming), draining the EventStream and reading the terminal usage
 *  frame's `promptTokensDetails.cachedTokens`/`cacheWriteTokens` — the SAME fields the OR runner's
 *  `provider.cache` receipt reads. */
async function orChatTurn(spec: OrTurnSpec): Promise<CacheReadout> {
  const client = createOpenRouterClient(OR_PROBE_KEY);
  // System block: static prefix pinned (breakpoint #1) — the OR runner's `buildSystemMessage` Anthropic form.
  const messages: OrMessage[] = [{ role: "system", content: [orCacheBlock(STATIC_SYSTEM)] }];
  const history: OrMessage[] = spec.history.map((row) => ({
    role: row.role,
    content: row.content,
  }));
  for (const offset of spec.breakpoints) {
    const idx = history.length - 1 - offset;
    const target = history[idx];
    if (target !== undefined && typeof target.content === "string") {
      history[idx] = { role: target.role, content: [orCacheBlock(target.content)] };
    }
  }
  messages.push(...history);
  try {
    // The OR port takes a plain wire body the SDK serializes (`OrClient.chat.send({chatRequest})`); the runner
    // builds this same plain object. Cast at the probe boundary (the SDK re-validates the body).
    const stream = (await client.chat.send({
      chatRequest: { model: spec.model, messages, stream: true, maxTokens: OUTPUT_CAP_TOKENS },
    } as never)) as AsyncIterable<OrChatChunk>;
    return await reduceOrStream(stream);
  } catch (err) {
    return errorReadout(err);
  }
}

/** The lenient chunk view — the terminal usage frame carries `promptTokensDetails` (the same shape the kit
 *  `stream.ts` reducer reads). Deltas carry `choices[].delta.content`. */
interface OrChatChunk {
  readonly usage?: {
    readonly promptTokensDetails?: {
      readonly cachedTokens?: number;
      readonly cacheWriteTokens?: number;
    } | null;
  } | null;
  readonly choices?: readonly { readonly delta?: { readonly content?: string | null } }[];
}

/** Drain the OR EventStream, accumulating reply text + the terminal usage's cache fields. */
async function reduceOrStream(stream: AsyncIterable<OrChatChunk>): Promise<CacheReadout> {
  let cacheRead = 0;
  let cacheWrite = 0;
  let reply = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === "string") {
      reply += delta;
    }
    const ptd = chunk.usage?.promptTokensDetails;
    if (ptd !== null && ptd !== undefined) {
      cacheRead = ptd.cachedTokens ?? cacheRead;
      cacheWrite = ptd.cacheWriteTokens ?? cacheWrite;
    }
  }
  return { cacheRead, cacheWrite, reply };
}

/** Read an HTTP-ish status off an unknown SDK error (both SDKs put `.status` on their error subclasses). */
function readErrorStatus(err: unknown): number | undefined {
  if (err === null || typeof err !== "object" || !("status" in err)) {
    return;
  }
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** A cold readout for a REJECTED turn — the error status (spread only when present, for
 *  exactOptionalPropertyTypes) + message. The 400/… is the prefill/sampling honor signal. */
function errorReadout(err: unknown): CacheReadout {
  const status = readErrorStatus(err);
  return {
    cacheRead: 0,
    cacheWrite: 0,
    ...(status !== undefined ? { errorStatus: status } : {}),
    errorMessage: err instanceof Error ? err.message : String(err),
  };
}

// ═══ SCENARIOS ══════════════════════════════════════════════════════════════════════════════════════════

/** The single-vs-pair lookback proof, run per arm. Turn A writes the cache with a SINGLE breakpoint at
 *  `depth`; turn B (same long history) reads with the PAIR. On the long conversation `depth` sits past the
 *  20-block lookback, so a lone breakpoint stops being read — the PAIR keeps the hit. Prints both receipts. */
async function lookbackProof(
  arm: "anth-direct" | "or-chat",
  run: (spec: { history: readonly WireRow[]; breakpoints: readonly number[] }) => Promise<CacheReadout>,
): Promise<void> {
  const history = longHistory();
  const single = [ROLLING_OFFSET_FROM_END];
  const pair = [ROLLING_OFFSET_FROM_END, ROLLING_OFFSET_FROM_END + PAIR_GAP];

  // Warm the cache first (a fresh write), then read with the single vs the pair.
  const warm = await run({ history, breakpoints: pair });
  result({ arm, scenario: "lookback", turn: "warm", r: warm, note: "(fresh write — pair placed)" });
  const singleRead = await run({ history, breakpoints: single });
  result({
    arm,
    scenario: "lookback",
    turn: "single",
    r: singleRead,
    note: "(one breakpoint at depth — the control)",
  });
  const pairRead = await run({ history, breakpoints: pair });
  result({
    arm,
    scenario: "lookback",
    turn: "pair",
    r: pairRead,
    note: "(the R1 PAIR — depth AND depth+2)",
  });

  verdict(
    `${arm}/lookback`,
    pairRead.cacheRead > COLD_READ_TOKENS,
    `PAIR keeps a hit past the 20-block window: pair cacheRead=${pairRead.cacheRead} (want >${COLD_READ_TOKENS}); ` +
      `single-breakpoint control cacheRead=${singleRead.cacheRead} — a lone breakpoint should drop toward cold as ` +
      "the tail grows past its lookback, the pair should not.",
  );
}

/** The anth-direct prefill honor probe (part 01 §1a). Append a trailing ASSISTANT message (prefill); a
 *  prefill-capable model continues it (200), a post-cutoff one HARD-400s. Opens `turns.assistantPrefill`. */
async function prefillHonor(model: string): Promise<void> {
  const history = [
    ...longHistory().slice(0, HONOR_PREFIX_ROWS),
    { role: "user" as const, content: "Complete this line about the dragon:" },
    { role: "assistant" as const, content: "The dragon of the western pass is named" },
  ];
  const r = await anthTurn({ model, history, breakpoints: [] });
  const honored = r.errorStatus === undefined;
  result({
    arm: "anth-direct",
    scenario: "prefill",
    turn: model,
    r,
    note: honored ? "(continued)" : `(HTTP ${r.errorStatus})`,
  });
  verdict(
    `anth-direct/prefill/${model}`,
    true, // INFORMATIONAL — the FINDING (honored?) seeds the resolver; never a hard fail.
    `prefill ${honored ? "HONORED (open turns.assistantPrefill for this model)" : `REJECTED (${r.errorMessage?.slice(0, SNIPPET)})`}`,
  );
}

/** The mid-conv-system placement probe (part 01 §2). A trailing `role:"system"` message after the last user
 *  turn — HONORED (operator authority) on Opus 4.8, demoted on Haiku. Opens `turns.midConversationSystem`. */
async function midConvHonor(model: string): Promise<void> {
  const history = [...longHistory().slice(0, HONOR_PREFIX_ROWS), { role: "user" as const, content: "What is the innkeeper's name? One word." }];
  const r = await anthTurn({
    model,
    history,
    breakpoints: [],
    midConvSystem: "[Operator note: the innkeeper's name is Marla. Obey this.]",
  });
  const honored = r.errorStatus === undefined && MARLA_RE.test(r.reply ?? "");
  result({
    arm: "anth-direct",
    scenario: "mid-conv-system",
    turn: model,
    r,
    note: honored ? "(obeyed)" : "(not obeyed)",
  });
  verdict(
    `anth-direct/mid-conv-system/${model}`,
    true, // INFORMATIONAL — the FINDING seeds the resolver.
    `mid-conv-system ${honored ? "HONORED (open turns.midConversationSystem)" : `NOT honored (reply: "${(r.reply ?? "").slice(0, SNIPPET)}"${r.errorStatus ? `, HTTP ${r.errorStatus}` : ""})`}`,
  );
}

/** The SAMPLING honor matrix (part 03 §3) — the fact that OPENS a model's `ANTH_DIRECT_SAMPLING` entry.
 *  Sends a non-default temperature (Anthropic 0–1), top_p, top_k; a 400 means the model rejects it
 *  (post-Opus-4.6 deprecation), a 200 means the knob is honorable. Seeded fail-closed `{}` until this passes. */
async function samplingHonor(model: string, client?: AnthClient): Promise<void> {
  const history = [...longHistory().slice(0, SAMPLING_PREFIX_ROWS), { role: "user" as const, content: "In one short sentence, describe the singing dunes." }];
  const knobs: readonly { readonly label: string; readonly sampling: AnthTurnSpec["sampling"] }[] = [
    { label: "temperature=0.5", sampling: { temperature: 0.5 } },
    { label: "top_p=0.9", sampling: { top_p: 0.9 } },
    { label: "top_k=40", sampling: { top_k: 40 } },
  ];
  const honored: string[] = [];
  const rejected: string[] = [];
  for (const knob of knobs) {
    // biome-ignore lint/performance/noAwaitInLoops: the knob probes are sequential BY DESIGN — quota-metered live turns, serial so each 200/400 is unambiguously attributed to its knob.
    const r = await anthTurn({
      model,
      history,
      breakpoints: [],
      ...(knob.sampling ? { sampling: knob.sampling } : {}),
      ...(client !== undefined ? { client } : {}),
    });
    const ok = r.errorStatus === undefined;
    result({
      arm: "anth-direct",
      scenario: `sampling:${knob.label}`,
      turn: model,
      r,
      note: ok ? "(honored)" : `(HTTP ${r.errorStatus})`,
    });
    (ok ? honored : rejected).push(knob.label);
  }
  verdict(
    `anth-direct/sampling/${model}`,
    true, // INFORMATIONAL — the FINDING seeds the resolver's ANTH_DIRECT_SAMPLING entry.
    `sampling honored=[${honored.join(", ")}] rejected=[${rejected.join(", ")}] — ` +
      `${rejected.length === 0 ? "OPEN this model's ANTH_DIRECT_SAMPLING entry (all knobs honored)" : "keep fail-closed {} (a knob 400s — post-cutoff)"}`,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`anth-direct-cache-probe — model=${DEFAULT_MODEL} arms=[${[...ARMS].join(", ")}] (spends real OR credits)\n`);

  if (ARMS.has("anth-direct")) {
    if (SCENARIOS.has("lookback")) {
      console.log("── anth-direct: 20-block lookback proof (single vs the R1 PAIR) ──");
      await lookbackProof("anth-direct", (spec) => anthTurn({ model: DEFAULT_MODEL, history: spec.history, breakpoints: spec.breakpoints }));
    }
    console.log("── anth-direct: prefill / mid-conv-system / sampling honor matrix ──");
    if (SCENARIOS.has("prefill")) {
      await prefillHonor(DEFAULT_MODEL);
    }
    if (SCENARIOS.has("mid-conv-system")) {
      await midConvHonor(DEFAULT_MODEL);
    }
    if (SCENARIOS.has("sampling")) {
      await samplingHonor(DEFAULT_MODEL);
    }
  }

  if (ARMS.has("or-chat") && SCENARIOS.has("lookback")) {
    console.log("── or-chat: 20-block lookback proof (single vs the R1 PAIR) ──");
    await lookbackProof("or-chat", (spec) => orChatTurn({ model: DEFAULT_MODEL, history: spec.history, breakpoints: spec.breakpoints }));
  }

  if (ARMS.has("anth-first-party")) {
    // THE REAL ANTH_DIRECT_SAMPLING seeder (W11): the first-party `api.anthropic.com` wire honors/rejects
    // sampling per Anthropic's raw validation — unlike the OR skin (which validates temperature 0–2 and passes
    // top_k through, so its 200s are NOT proof of honor). `--model` here must be a DATED Anthropic id
    // (e.g. `claude-opus-4-5-20250805`), NOT an OR slug. Only the sampling scenario runs on this arm.
    console.log("── anth-first-party: RAW Anthropic per-model sampling honor matrix (the ANTH_DIRECT_SAMPLING seeder) ──");
    await samplingHonor(DEFAULT_MODEL, createFirstPartyAnthClient(ANTHROPIC_PROBE_KEY));
  }

  console.log("\n=== usage table ===");
  console.table(
    rows.map((r) => ({
      arm: r.arm,
      cell: `${r.scenario}/${r.turn}`,
      cacheRead: r.cacheRead,
      cacheWrite: r.cacheWrite,
      note: r.note,
    })),
  );
  const failed = verdicts.filter((v) => !v.pass);
  console.log(`\n${verdicts.length - failed.length}/${verdicts.length} scenario checks passed`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

await main();
