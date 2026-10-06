// Speaker-pick probe runner: measures who each candidate picks at every fixture cut, then scores the picks
// against a Sonnet 5 reference and the hand judgments. The arbiter arms call the production `smartArbitrate`
// and the reranker arm the production local-light `scorePairs`, so the prompt bytes and the parse are shipped code.

import fs from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { SpeakerRef } from "@orb/contracts/chat";
import { speakerKey, TALKATIVENESS_DEFAULT } from "@orb/contracts/chat";
import type { RerankOnnx } from "@orb/contracts/inference";
import { modelIdSchema } from "@orb/contracts/inference";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { ResponseFormat, SummarizeInput, SummarizeOptions } from "@orb/contracts/role-clients";
import type { InferenceLog } from "@orb/inference";
import { DEFAULT_RERANK_MODEL } from "../../../packages/inference/src/backends/local-light/index.ts";
import { createModelCache } from "../../../packages/inference/src/backends/local-light/model-cache.ts";
import { localLightRows } from "../../../packages/inference/src/capability/sources/curated/local-light.ts";
import type { LocalLightRerankServing } from "../../../packages/inference/src/contract/local-light-worker.ts";
import type { ArbiterCandidate, SpeakerCandidate, TranscriptLine } from "../../../packages/server/src/domain/chat/contract/arbitration.ts";
import { resolveNameMentions, selectSpeakers } from "../../../packages/server/src/domain/chat/engine/select-speakers.ts";
import { smartArbitrate } from "../../../packages/server/src/domain/chat/engine/smart-arbitrate.ts";
import { orCall, readEnvKey, totalSpend } from "../openrouter/_kit.ts";
import type { Cut, CutKind, Room, RoomCharacter } from "./fixtures.ts";
import { ROOMS } from "./fixtures.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(DIR, "results");
const REPO = path.resolve(DIR, "../../..");
/** The production arbiter window: `turn.ts` reads the trailing ten canon rows. */
const WINDOW = 10;
const REFERENCE_MODEL = "anthropic/claude-sonnet-5";
const REFERENCE_MAX_TOKENS = 300;
const LOCAL_BASE = "http://127.0.0.1:28121";
const HTTP_OK = 200;
/** Draws per cut for the expected agreement of the random `natural` policy. */
const NATURAL_DRAWS = 4000;
const RNG_SEED = 24_601;
// Park-Miller minimal standard: every product stays below 2^53, so plain float arithmetic is exact.
const PM_MODULUS = 2_147_483_647;
const PM_MULTIPLIER = 48_271;
const ARBITER_SAMPLING: SummarizeOptions = SIDE_GEN_POSTURES.arbiter;
/** Sonnet 5's context window, the cap the arbiter sizes the line it answers against. */
const PROBE_CONTEXT_TOKENS = 200_000;
const MEBIBYTE = 1_048_576;
const PERCENT = 100;
const P50 = 0.5;
const P95 = 0.95;
const USD_DIGITS = 4;
const COST_DIGITS = 6;
const EXIT_MISUSE = 3;

interface Case {
  readonly room: Room;
  readonly cut: Cut;
  readonly transcript: string;
  /** The same window as the canon lines `turn.ts` hands the arbiter: a human line carries no character. */
  readonly lines: readonly TranscriptLine[];
  readonly trigger: { readonly speaker: string; readonly text: string };
  readonly lastSpeaker: RoomCharacter | null;
  readonly candidates: readonly ArbiterCandidate[];
  readonly speakerCandidates: readonly SpeakerCandidate[];
  /** What `turn.ts` passes as `mentionedIds`: plain-word names in a human trigger only. */
  readonly humanMentions: ReturnType<typeof resolveNameMentions>;
  /** The same resolver over the trigger whoever wrote it: the cheap heuristic an AI-to-AI round lacks today. */
  readonly anyMentions: ReturnType<typeof resolveNameMentions>;
}

interface PickRow {
  readonly arm: string;
  readonly room: string;
  readonly at: number;
  readonly pick: string | null;
  readonly degraded?: boolean;
  readonly reply?: string;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
  readonly ms?: number;
  readonly costUsd?: number | null;
  readonly requestId?: string | null;
  readonly serverPromptMs?: number | null;
  readonly serverGenMs?: number | null;
}

interface ReferenceRow {
  readonly arm: "reference";
  readonly room: string;
  readonly at: number;
  readonly best: string | null;
  readonly plausible: readonly string[];
  readonly why: string;
  readonly costUsd: number | null;
  readonly requestId: string | null;
}

function characterRef(c: RoomCharacter): SpeakerRef {
  return { kind: "character", characterId: c.id };
}

function caseKey(c: Case): string {
  return `${c.room.id}@${c.cut.at}`;
}

function buildCases(): Case[] {
  return ROOMS.flatMap((room) =>
    room.cuts.map((cut): Case => {
      const window = room.lines.slice(Math.max(0, cut.at - WINDOW), cut.at);
      const trigger = window.at(-1);
      if (trigger === undefined) {
        throw new Error(`${room.id}@${cut.at}: empty window`);
      }
      const lastName = room.lines.slice(0, cut.at).findLast((l) => l.speaker !== room.user)?.speaker;
      const speakerCandidates = room.characters.map((c) => ({ ref: characterRef(c), name: c.name }));
      return {
        room,
        cut,
        transcript: window.map((l) => `${l.speaker}: ${l.text}`).join("\n"),
        lines: window.map((l) => ({ speakerName: l.speaker, text: l.text, characterId: room.characters.find((c) => c.name === l.speaker)?.id ?? null })),
        trigger,
        lastSpeaker: room.characters.find((c) => c.name === lastName) ?? null,
        candidates: room.characters.map((c) => ({ ref: characterRef(c), talkativeness: TALKATIVENESS_DEFAULT, disabled: false, leftSeq: null })),
        speakerCandidates,
        humanMentions: trigger.speaker === room.user ? resolveNameMentions(trigger.text, speakerCandidates) : [],
        anyMentions: resolveNameMentions(trigger.text, speakerCandidates),
      };
    }),
  );
}

function nameOf(c: Case, ref: SpeakerRef | undefined): string | null {
  if (ref === undefined) {
    return null;
  }
  return c.speakerCandidates.find((s) => speakerKey(s.ref) === speakerKey(ref))?.name ?? null;
}

function seededRng(seed: number): () => number {
  let state = seed % PM_MODULUS;
  return () => {
    state = (state * PM_MULTIPLIER) % PM_MODULUS;
    return (state - 1) / (PM_MODULUS - 1);
  };
}

function resultsFile(arm: string): string {
  return path.join(RESULTS_DIR, `${arm}.jsonl`);
}

function writeRows(arm: string, rows: readonly object[]): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(resultsFile(arm), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
}

function readRows<T>(arm: string): T[] {
  const file = resultsFile(arm);
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/u)
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

// ---- reference: Sonnet 5 with the personas, asked for the best pick and every plausible one ----

function referencePrompt(c: Case): { system: string; user: string } {
  const roster = c.room.characters.map((ch) => `- ${ch.name}: ${ch.persona}`).join("\n");
  return {
    system:
      "You judge turn order in a multi-character roleplay. The human player writes as their own persona and is never a candidate. " +
      'Given the cast and the recent conversation, decide which character should speak next. Reply with JSON only: {"best": "<name>", "plausible": ["<name>", ...], "why": "<one short sentence>"}. ' +
      "`plausible` lists every character whose speaking next would read as natural to a careful reader, best included.",
    user: `The human player is ${c.room.user}.\n\nCast:\n${roster}\n\nRecent conversation:\n${c.transcript}\n\nWho speaks next?`,
  };
}

function parseReference(text: string, names: readonly string[]): { best: string | null; plausible: string[]; why: string } {
  const body = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(body) as { best?: unknown; plausible?: unknown; why?: unknown };
  const known = (v: unknown): string | null => (typeof v === "string" ? (names.find((n) => n.toLowerCase() === v.trim().toLowerCase()) ?? null) : null);
  const plausible = Array.isArray(parsed.plausible) ? parsed.plausible.map(known).filter((n): n is string => n !== null) : [];
  const best = known(parsed.best);
  return {
    best,
    plausible: best !== null && !plausible.includes(best) ? [best, ...plausible] : plausible,
    why: typeof parsed.why === "string" ? parsed.why : "",
  };
}

async function runReference(all: readonly Case[]): Promise<void> {
  const key = readEnvKey("OPENROUTER_API_KEY");
  if (key.length === 0) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  const out: ReferenceRow[] = [];
  for (const c of all) {
    const prompt = referencePrompt(c);
    const r = await orCall(
      {
        model: REFERENCE_MODEL,
        temperature: 0,
        max_tokens: REFERENCE_MAX_TOKENS,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      },
      key,
    );
    const parsed = parseReference(
      r.message?.content ?? "",
      c.room.characters.map((ch) => ch.name),
    );
    out.push({ arm: "reference", room: c.room.id, at: c.cut.at, ...parsed, costUsd: r.usage.cost, requestId: r.json.id ?? null });
    console.log(`${caseKey(c)} best=${parsed.best} plausible=${parsed.plausible.join("/")} ${r.json.id}`);
  }
  writeRows("reference", out);
  console.log(`spend $${totalSpend().toFixed(USD_DIGITS)}`);
}

// ---- arbiter: the production smartArbitrate over an injected summarize ----

interface CallStats {
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly costUsd: number | null;
  readonly requestId: string | null;
  readonly reply: string;
  /** llama.cpp's own prompt and generation time, so host contention can be told apart from model cost. */
  readonly serverPromptMs?: number | null;
  readonly serverGenMs?: number | null;
}

/** One completion constrained to the arbiter's response schema, the way the production structured call sends it. */
type Completion = (input: SummarizeInput, opts: SummarizeOptions, format: ResponseFormat) => Promise<CallStats>;

function wireMessages(input: SummarizeInput): { role: string; content: string }[] {
  return [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: input.userPrompt },
  ];
}

function wireSampling(opts: SummarizeOptions): Record<string, number> {
  return {
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.maxOutputTokens !== undefined ? { max_tokens: opts.maxOutputTokens } : {}),
  };
}

function openRouterCompletion(model: string, key: string): Completion {
  return async (input, opts, format) => {
    const r = await orCall(
      {
        model,
        ...wireSampling(opts),
        messages: wireMessages(input),
        // The shape the production OpenRouter arm sends (`openai-compat/chat.ts`): no `strict`, no `require_parameters`.
        response_format: { type: "json_schema", json_schema: { name: format.name, schema: format.schema } },
      },
      key,
    );
    if (r.status !== HTTP_OK) {
      throw new Error(`openrouter ${r.status}: ${r.error ?? ""}`);
    }
    return {
      tokensIn: r.usage.promptTokens,
      tokensOut: r.usage.completionTokens,
      costUsd: r.usage.cost,
      requestId: r.json.id ?? null,
      reply: r.message?.content ?? "",
    };
  };
}

interface LlamaCppResponse {
  readonly choices?: readonly { readonly message?: { readonly content?: string | null } }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
  readonly timings?: { readonly prompt_ms?: number; readonly predicted_ms?: number };
}

function llamaCppCompletion(base: string): Completion {
  return async (input, opts, format) => {
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Each round is a fresh classification; a reused KV prefix would flatter the latency of later cuts.
      body: JSON.stringify({ ...wireSampling(opts), cache_prompt: false, messages: wireMessages(input), json_schema: format.schema }),
    });
    if (!response.ok) {
      throw new Error(`llama.cpp ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json()) as LlamaCppResponse;
    return {
      tokensIn: json.usage?.prompt_tokens ?? null,
      tokensOut: json.usage?.completion_tokens ?? null,
      costUsd: null,
      requestId: null,
      reply: json.choices?.[0]?.message?.content ?? "",
      serverPromptMs: json.timings?.prompt_ms === undefined ? null : Math.round(json.timings.prompt_ms),
      serverGenMs: json.timings?.predicted_ms === undefined ? null : Math.round(json.timings.predicted_ms),
    };
  };
}

async function runArbiter(all: readonly Case[], arm: string, completion: Completion): Promise<void> {
  const out: PickRow[] = [];
  const rng = seededRng(RNG_SEED);
  for (const c of all) {
    const calls: CallStats[] = [];
    const started = performance.now();
    const result = await smartArbitrate({
      arbiter: () =>
        Promise.resolve({
          contextTokens: PROBE_CONTEXT_TOKENS,
          structured: async (
            inputs: readonly SummarizeInput[],
            opts: SummarizeOptions & { readonly responseFormat: ResponseFormat },
          ): Promise<SummarizeResult> => {
            const input = inputs[0];
            if (input === undefined) {
              throw new Error("smartArbitrate sent no input");
            }
            const stats = await completion(input, opts, opts.responseFormat);
            calls.push(stats);
            return { items: [{ text: stats.reply, usage: { tokensIn: stats.tokensIn, tokensOut: stats.tokensOut, costUsd: stats.costUsd } }], model: arm };
          },
        }),
      candidates: c.candidates,
      speakerCandidates: c.speakerCandidates,
      characterLines: new Map(c.room.characters.map((ch) => [ch.id, ch.persona] as const)),
      transcript: c.lines,
      humanNames: [c.room.user],
      room: {},
      lastSpeaker: c.lastSpeaker === null ? null : characterRef(c.lastSpeaker),
      mentionedIds: c.humanMentions,
      rng,
      prose: {},
      sampling: ARBITER_SAMPLING,
    });
    const ms = Math.round(performance.now() - started);
    const pick = nameOf(c, result.speakers[0]);
    const call = calls.at(-1);
    out.push({
      arm,
      room: c.room.id,
      at: c.cut.at,
      pick,
      degraded: result.degraded,
      reply: call?.reply ?? "",
      tokensIn: call?.tokensIn ?? null,
      tokensOut: call?.tokensOut ?? null,
      ms,
      costUsd: call?.costUsd ?? null,
      requestId: call?.requestId ?? null,
      serverPromptMs: call?.serverPromptMs ?? null,
      serverGenMs: call?.serverGenMs ?? null,
    });
    console.log(`${caseKey(c)} ${pick}${result.degraded ? " (degraded)" : ""} ${ms}ms reply=${JSON.stringify(call?.reply ?? "")}`);
  }
  writeRows(arm, out);
}

// ---- reranker: the production local-light cross-encoder, query = transcript, documents = name plus persona ----

const silentLog: InferenceLog = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

function argmax(scores: ReadonlyMap<string, number>, exclude: string | null): string | null {
  let best: string | null = null;
  let top = Number.NEGATIVE_INFINITY;
  for (const [name, score] of scores) {
    if (name !== exclude && score > top) {
      best = name;
      top = score;
    }
  }
  return best;
}

function percentile(sorted: readonly number[], p: number): number {
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0);
}

const RERANK_VARIANTS = ["window", "trigger", "trigger-banlast", "mention-then-trigger"] as const;
type RerankVariant = (typeof RERANK_VARIANTS)[number];

/** The curated local-light serving for a reranker id: the window and ONNX serving the shipped task passes. */
function curatedRerankServing(model: string): LocalLightRerankServing {
  const row = localLightRows.find((candidate) => candidate.kind === "rerank" && (candidate.match.ids as readonly string[]).includes(model));
  if (row?.kind !== "rerank") {
    throw new Error(`no curated local-light rerank row for ${model}`);
  }
  return { maxInputTokens: row.rerank.maxInputTokens, onnx: "onnx" in row.rerank ? (row.rerank.onnx as RerankOnnx) : undefined };
}

async function runRerank(all: readonly Case[], label: string): Promise<void> {
  const cacheDir = argValue("cache") ?? path.join(REPO, ".cache/speaker-pick/transformers");
  const rssBefore = process.memoryUsage().rss;
  const cache = createModelCache({ device: "cpu", cacheDir, allowRemoteModels: false, log: silentLog, detach: () => undefined });
  const loadStarted = performance.now();
  const reranker = modelIdSchema.parse(argValue("reranker") ?? DEFAULT_RERANK_MODEL);
  const serving = curatedRerankServing(reranker);
  await cache.preload("rerank", reranker, serving.onnx);
  const loadMs = Math.round(performance.now() - loadStarted);
  const picks = new Map<RerankVariant, PickRow[]>(RERANK_VARIANTS.map((v) => [v, []]));
  const timings: number[] = [];
  for (const c of all) {
    const names = c.room.characters.map((ch) => ch.name);
    const documents = c.room.characters.map((ch) => `${ch.name}: ${ch.persona}`);
    const score = async (query: string): Promise<{ scores: Map<string, number>; ms: number }> => {
      const started = performance.now();
      const raw = await cache.scorePairs(reranker, query, documents, serving);
      const ms = performance.now() - started;
      timings.push(ms);
      return { scores: new Map(names.map((n, i) => [n, raw[i] ?? Number.NEGATIVE_INFINITY])), ms: Math.round(ms) };
    };
    const { scores: windowScores, ms: windowMs } = await score(c.transcript);
    const { scores: triggerScores, ms: triggerMs } = await score(`${c.trigger.speaker}: ${c.trigger.text}`);
    const last = c.lastSpeaker?.name ?? null;
    // A name in the trigger outranks ban-last: being addressed is the strongest signal a line carries.
    const mentioned = c.anyMentions.map((id) => c.room.characters.find((ch) => ch.id === id)?.name).find((n) => n !== undefined && n !== c.trigger.speaker);
    const chosen: Record<RerankVariant, string | null> = {
      window: argmax(windowScores, null),
      trigger: argmax(triggerScores, null),
      "trigger-banlast": argmax(triggerScores, last),
      "mention-then-trigger": mentioned ?? argmax(triggerScores, last),
    };
    for (const variant of RERANK_VARIANTS) {
      picks
        .get(variant)
        ?.push({ arm: `${label}-${variant}`, room: c.room.id, at: c.cut.at, pick: chosen[variant], ms: variant === "window" ? windowMs : triggerMs });
    }
  }
  const sorted = timings.toSorted((a, b) => a - b);
  const meta = {
    arm: `${label}-meta`,
    threads: availableParallelism(),
    loadMs,
    scorePairsCalls: timings.length,
    p50Ms: percentile(sorted, P50),
    p95Ms: percentile(sorted, P95),
    maxMs: percentile(sorted, 1),
    rssDeltaMb: Math.round((process.memoryUsage().rss - rssBefore) / MEBIBYTE),
  };
  for (const [variant, rows] of picks) {
    writeRows(`${label}-${variant}`, rows);
  }
  writeRows(`${label}-meta`, [meta]);
  console.log(JSON.stringify(meta));
}

// ---- report ----

type KindTally = Map<CutKind, { hit: number; n: number }>;

interface Tally {
  agree: number;
  /** Cuts where the reference named a character; it names none when the human player should answer. */
  refNamed: number;
  plausible: number;
  hand: number;
  judged: number;
  degraded: number;
  readonly byKind: KindTally;
}

interface ReportContext {
  readonly all: readonly Case[];
  readonly reference: ReadonlyMap<string, ReferenceRow>;
  readonly kinds: Map<string, KindTally>;
  readonly misses: string[];
}

function newTally(): Tally {
  return { agree: 0, refNamed: 0, plausible: 0, hand: 0, judged: 0, degraded: 0, byKind: new Map() };
}

/** Expected agreement of a random policy: the share of seeded draws that land on each name. */
function naturalShares(c: Case, mentions: Case["humanMentions"]): Map<string, number> {
  const rng = seededRng(RNG_SEED);
  const counts = new Map<string, number>();
  for (let i = 0; i < NATURAL_DRAWS; i += 1) {
    const ref = selectSpeakers({
      candidates: c.candidates,
      policy: "natural",
      lastSpeaker: c.lastSpeaker === null ? null : characterRef(c.lastSpeaker),
      mentionedIds: mentions,
      rng,
      maxSpeakers: 1,
    })[0];
    const name = nameOf(c, ref) ?? "(none)";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Map([...counts].map(([n, k]) => [n, k / NATURAL_DRAWS]));
}

function tallyCase(t: Tally, c: Case, shares: ReadonlyMap<string, number>, ref: ReferenceRow | undefined): number {
  const mass = (names: readonly string[]): number => names.reduce((sum, n) => sum + (shares.get(n) ?? 0), 0);
  if (ref !== undefined && ref.best !== null) {
    t.agree += mass([ref.best]);
    t.refNamed += 1;
  }
  t.plausible += ref === undefined ? 0 : mass(ref.plausible);
  if (c.cut.accept === null) {
    return Number.NaN;
  }
  const hit = mass(c.cut.accept);
  t.hand += hit;
  t.judged += 1;
  const cell = t.byKind.get(c.cut.kind) ?? { hit: 0, n: 0 };
  t.byKind.set(c.cut.kind, { hit: cell.hit + hit, n: cell.n + 1 });
  return hit;
}

function share(n: number, d: number): string {
  return d === 0 ? "n/a" : `${Math.round((PERCENT * n) / d)}%`;
}

function median(values: readonly number[]): number | null {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted.length === 0 ? null : (sorted[Math.floor(sorted.length / 2)] ?? null);
}

function usageCells(rows: readonly PickRow[]): string {
  const nums = (pick: (r: PickRow) => number | null | undefined): number[] => rows.map(pick).filter((v): v is number => typeof v === "number");
  const ms = nums((r) => r.ms);
  const cost = nums((r) => r.costUsd);
  const tokens = `${median(nums((r) => r.tokensIn)) ?? "-"} / ${median(nums((r) => r.tokensOut)) ?? "-"}`;
  const server = nums((r) => r.serverPromptMs);
  const serverCell = server.length === 0 ? "" : ` (server prompt ${median(server)} + gen ${median(nums((r) => r.serverGenMs))})`;
  const latency = `${median(ms) ?? "-"} / ${ms.length === 0 ? "-" : Math.max(...ms)}${serverCell}`;
  const costCell = cost.length === 0 ? "-" : `$${(cost.reduce((a, b) => a + b, 0) / cost.length).toFixed(COST_DIGITS)}`;
  return `${tokens} | ${latency} | ${costCell}`;
}

function tallyRow(arm: string, t: Tally, total: number, usage: string): string {
  return `| ${arm} | ${share(t.agree, t.refNamed)} | ${share(t.plausible, total)} | ${share(t.hand, t.judged)} | ${t.degraded} | ${usage} |`;
}

function reportNatural(ctx: ReportContext): string[] {
  const arms = [
    { arm: "natural", mentions: (c: Case): Case["humanMentions"] => c.humanMentions },
    { arm: "natural-any-mention", mentions: (c: Case): Case["humanMentions"] => c.anyMentions },
  ];
  return arms.map(({ arm, mentions }) => {
    const t = newTally();
    for (const c of ctx.all) {
      tallyCase(t, c, naturalShares(c, mentions(c)), ctx.reference.get(caseKey(c)));
    }
    ctx.kinds.set(arm, t.byKind);
    return tallyRow(`${arm} (expected over ${NATURAL_DRAWS} draws)`, t, ctx.all.length, "0 / 0 | under 1 / under 1 | free");
  });
}

function reportArm(ctx: ReportContext, arm: string): string {
  const rows = new Map(readRows<PickRow>(arm).map((r) => [`${r.room}@${r.at}`, r]));
  const t = newTally();
  for (const c of ctx.all) {
    const row = rows.get(caseKey(c));
    const pick = row?.pick ?? null;
    const hit = tallyCase(t, c, new Map(pick === null ? [] : [[pick, 1]]), ctx.reference.get(caseKey(c)));
    t.degraded += row?.degraded === true ? 1 : 0;
    if (hit === 0) {
      ctx.misses.push(
        `| ${arm} | ${caseKey(c)} | ${c.cut.kind} | ${pick ?? "-"} | ${(c.cut.accept ?? []).join(", ")} | ${row?.degraded === true ? "degraded" : ""} |`,
      );
    }
  }
  ctx.kinds.set(arm, t.byKind);
  return tallyRow(arm, t, ctx.all.length, usageCells([...rows.values()]));
}

function kindTable(all: readonly Case[], kinds: ReadonlyMap<string, KindTally>): string[] {
  const kindNames: CutKind[] = [...new Set(all.filter((c) => c.cut.accept !== null).map((c) => c.cut.kind))];
  const lines = [`| arm | ${kindNames.map((k) => k.replaceAll("-", " ")).join(" | ")} |`, `| - |${kindNames.map(() => " - |").join("")}`];
  for (const [arm, byKind] of kinds) {
    const cells = kindNames.map((k) => {
      const cell = byKind.get(k);
      return cell === undefined ? "-" : `${share(cell.hit, cell.n)} of ${cell.n}`;
    });
    lines.push(`| ${arm} | ${cells.join(" | ")} |`);
  }
  return lines;
}

function report(all: readonly Case[]): void {
  const reference = new Map(readRows<ReferenceRow>("reference").map((r) => [`${r.room}@${r.at}`, r]));
  if (reference.size === 0) {
    throw new Error("no reference rows; run the reference arm first");
  }
  const arms = fs
    .readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".jsonl") && f !== "reference.jsonl" && !f.endsWith("-meta.jsonl"))
    .map((f) => f.slice(0, -".jsonl".length))
    .toSorted();
  const ctx: ReportContext = { all, reference, kinds: new Map(), misses: [] };
  const table = [
    "| arm | agrees with reference best | in reference plausible set | hand-judged hit | degraded | tokens in / out (median) | latency median / max ms | cost per round |",
    "| - | - | - | - | - | - | - | - |",
    ...reportNatural(ctx),
    ...arms.map((arm) => reportArm(ctx, arm)),
  ];
  const judged = all.filter((c) => c.cut.accept !== null);
  const refHits = judged.filter((c) => {
    const best = reference.get(caseKey(c))?.best;
    return best !== null && best !== undefined && (c.cut.accept ?? []).includes(best);
  }).length;
  const refCost = [...reference.values()].reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  console.log(
    `cases ${all.length}, hand-judged ${judged.length}; reference best hits the hand judgment on ${refHits}/${judged.length}; reference spend $${refCost.toFixed(USD_DIGITS)}\n`,
  );
  console.log(table.join("\n"));
  console.log(`\n${kindTable(all, ctx.kinds).join("\n")}`);
  console.log(`\n| arm | cut | kind | pick | accepted | note |\n| - | - | - | - | - | - |\n${ctx.misses.join("\n")}`);
  for (const f of fs.readdirSync(RESULTS_DIR).filter((name) => name.endsWith("-meta.jsonl"))) {
    console.log(fs.readFileSync(path.join(RESULTS_DIR, f), "utf8").trim());
  }
}

async function main(): Promise<void> {
  const fixtureCases = buildCases();
  const verb: string = process.argv.at(2) ?? "";
  switch (verb) {
    case "reference":
      await runReference(fixtureCases);
      return;
    case "arbiter-openrouter": {
      const model = argValue("model") ?? REFERENCE_MODEL;
      await runArbiter(
        fixtureCases,
        argValue("label") ?? `arbiter-${model.split("/").at(-1) ?? model}`,
        openRouterCompletion(model, readEnvKey("OPENROUTER_API_KEY")),
      );
      console.log(`spend $${totalSpend().toFixed(USD_DIGITS)}`);
      return;
    }
    case "arbiter-local": {
      const label = argValue("label");
      if (label === undefined) {
        throw new Error("--label=<model> is required");
      }
      await runArbiter(fixtureCases, `arbiter-${label}`, llamaCppCompletion(argValue("base") ?? LOCAL_BASE));
      return;
    }
    case "rerank":
      await runRerank(fixtureCases, argValue("label") ?? "rerank");
      return;
    case "report":
      report(fixtureCases);
      return;
    default:
      console.log(
        "usage: run.ts reference | arbiter-openrouter [--model=] | arbiter-local --label= [--base=] | rerank [--label=] [--cache=] [--reranker=<hub id>] | report",
      );
      process.exitCode = EXIT_MISUSE;
  }
}

await main();
