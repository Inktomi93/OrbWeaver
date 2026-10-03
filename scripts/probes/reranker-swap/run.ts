// Reranker-swap probe (work item 0514): does a long-window cross-encoder run through the shipped local-light
// `createModelCache().scorePairs`, does it rank sanely, and what does it cost on CPU next to MiniLM?
// One model per process so the RSS high-water mark is that model's alone.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RerankOnnx } from "@orb/contracts/inference";
import { modelIdSchema } from "@orb/contracts/inference";
import type { InferenceLog } from "@orb/inference";
import { localLightCpuThreads } from "../../../packages/inference/src/backends/local-light/cpu-budget.ts";
import { createModelCache } from "../../../packages/inference/src/backends/local-light/model-cache.ts";
import { localLightRows } from "../../../packages/inference/src/capability/sources/curated/local-light.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(DIR, "results");
const REPO = path.resolve(DIR, "../../..");
const SHORT_PAIR_TOKENS = 512;
const LONG_PAIR_TOKENS = 2048;
/** Default pair lengths measured (query + document + specials), in the model's own tokens; `--lengths=` overrides. */
const PAIR_TOKENS = [SHORT_PAIR_TOKENS, LONG_PAIR_TOKENS] as const;
/** Where the long-window case's fact sits: past MiniLM's 512-token window, inside a 2048 one. */
const FACT_OFFSET_TOKENS = 1200;
const DEFAULT_BATCH = 8;
const RUNS = 3;
const MIDDLE = 2;
const KIB = 1024;
const MIB = 1_048_576;
const EXIT_MISUSE = 3;
// Room for the pair's special tokens ([CLS] q [SEP] d [SEP] and the ModernBERT equivalents).
const SPECIAL_TOKENS = 4;
const FLAG_AFFIXES = "--=".length;

// The ettin model cards' example; the 32m card prints [6.21875, 10.8125, 8.5625, 9.875] (bf16, GPU).
const GOLDEN_QUERY = "Which planet is known as the Red Planet?";
const GOLDEN_PASSAGES = [
  "Venus is often called Earth's twin because of its similar size and proximity.",
  "Mars, known for its reddish appearance, is often referred to as the Red Planet.",
  "Jupiter, the largest planet in our solar system, has a prominent red spot.",
  "Saturn, famous for its rings, is sometimes mistaken for the Red Planet.",
];

const silentLog: InferenceLog = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

interface ProbeTokenizer {
  encode: (text: string, opts: { add_special_tokens: boolean }) => number[];
  decode: (ids: readonly number[], opts: { skip_special_tokens: boolean }) => string;
}

interface Case {
  readonly name: string;
  readonly query: string;
  readonly relevant: string;
  readonly irrelevant: string;
}

interface SanityRow {
  readonly case: string;
  readonly relevant: number;
  readonly irrelevant: number;
  readonly ok: boolean;
  readonly docTokens: number;
}

interface MemoryReading {
  readonly rssMib: number;
  readonly hwmMib: number;
}

interface LatencyRow {
  readonly pairTokens: number;
  readonly msPerPairMedian: number;
  readonly after: MemoryReading;
}

interface WorkloadRow {
  readonly name: string;
  readonly docs: number;
  readonly queryTokens: number;
  readonly docTokens: number;
  readonly msPerTurnMedian: number;
}

/** Per-turn rerank calls, before the window cut. Recall reranks `retrieveK` (8) digests, each at most the
 *  summarizer's 1024 output tokens, against the instruction plus the last two messages. Smart ranks 3–6
 *  `Name: persona` documents (the dev cards run 75–2841 chars) against the last line. */
const WORKLOADS = [
  { name: "smart-4x500", queryTokens: 60, docTokens: 500, docs: 4 },
  { name: "smart-6x1500", queryTokens: 60, docTokens: 1500, docs: 6 },
  { name: "recall-8x400", queryTokens: 400, docTokens: 400, docs: 8 },
  { name: "recall-8x1024", queryTokens: 600, docTokens: 1024, docs: 8 },
] as const;

function argValue(name: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return flag?.slice(name.length + FLAG_AFFIXES);
}

/** Current and peak resident set from /proc, in MiB: the native ONNX arena is off-heap, so only the kernel sees it. */
function memory(): MemoryReading {
  const status = readFileSync("/proc/self/status", "utf8");
  const lines = status.split("\n");
  const field = (key: string): number => Number.parseInt(lines.find((line) => line.startsWith(`${key}:`))?.slice(key.length + 1) ?? "0", 10) / KIB;
  return { rssMib: Math.round(field("VmRSS")), hwmMib: Math.round(field("VmHWM")) };
}

const FILLER = [
  "The harbor town kept its ledgers in a stone counting house above the fish market.",
  "Every spring the guild repainted the shutters a different shade of blue and argued about it for weeks.",
  "Merchants from the southern islands brought dried figs, copper wire and rumors about the weather.",
  "The lighthouse keeper wrote long letters to his sister describing the gulls by name.",
  "Children chalked maps of imaginary countries on the quay, and the tide erased them every evening.",
  "A choir practiced in the old granary on Thursdays, mostly hymns and one sea shanty nobody admitted to liking.",
  "The ferry schedule changed twice a year and was posted on a board that had not been level in decades.",
];

/** Filler of at least `tokens` tokens in this model's tokenizer, so a fact placed after it sits past that offset. */
function fillerOf(countTokens: (text: string) => number, tokens: number): string {
  const parts: string[] = [];
  let i = 0;
  while (countTokens(parts.join(" ")) < tokens) {
    parts.push(FILLER[i % FILLER.length] ?? "");
    i += 1;
  }
  return parts.join(" ");
}

function cases(countTokens: (text: string) => number): Case[] {
  const longPrefix = fillerOf(countTokens, FACT_OFFSET_TOKENS);
  return [
    {
      name: "short-qa",
      query: "How do I reset the password on my home router?",
      relevant:
        "To reset your router password, hold the reset button on the back for ten seconds, then log in at the admin page with the default credentials printed on the label.",
      irrelevant: "Preheat the oven, cream the butter and sugar, then fold in the flour and bake the sponge for twenty-five minutes.",
    },
    {
      name: "speaker-persona",
      query: "The engine is making that grinding noise again, can somebody who knows machines take a look?",
      relevant: "Mira: the ship's mechanic, grease to the elbows, talks to engines like old friends and can strip a drive coupling blindfolded.",
      irrelevant: "Tobias: a wandering poet who recites verses about the moon and faints at the sight of tools.",
    },
    {
      name: "fact-past-1200-tokens",
      query: "Where did Captain Aldous hide the brass key to the vault?",
      relevant: `${longPrefix} Captain Aldous hid the brass key to the vault inside the hollow figurehead of the ship.`,
      irrelevant: `${longPrefix} The baker on Wharf Street sells the best rye bread before seven in the morning.`,
    },
  ];
}

async function loadTokenizer(model: string): Promise<ProbeTokenizer> {
  // The lib resolves from the inference package, the only workspace member that depends on it.
  const entry = createRequire(path.join(REPO, "packages/inference/package.json")).resolve("@huggingface/transformers");
  const lib = (await import(pathToFileURL(entry).href)) as { AutoTokenizer: { from_pretrained: (id: string) => Promise<ProbeTokenizer> } };
  return await lib.AutoTokenizer.from_pretrained(model);
}

/** The model's curated `rerank.onnx`, or with `--file=<stem>` that file at fp32 on this architecture (how the
 *  quantized 17m was measured). */
function onnxFor(model: string): RerankOnnx | undefined {
  const row = localLightRows.find((candidate) => candidate.kind === "rerank" && (candidate.match.ids as readonly string[]).includes(model));
  const curated = row?.kind === "rerank" && "onnx" in row.rerank ? (row.rerank.onnx as RerankOnnx) : undefined;
  const file = argValue("file");
  return file === undefined ? curated : { head: curated?.head ?? "sentence-transformers", dtype: "fp32", files: { [process.arch]: file } };
}

interface Scorer {
  readonly scorePairs: (query: string, documents: readonly string[]) => Promise<number[]>;
}

const median = (samples: readonly number[]): number => Math.round(samples.toSorted((a, b) => a - b)[Math.floor(samples.length / MIDDLE)] ?? 0);

/** Median wall time of one `scorePairs` call over RUNS, after one warm-up pair. */
async function timeCall(scorer: Scorer, query: string, docs: readonly string[]): Promise<number> {
  await scorer.scorePairs(query, docs.slice(0, 1));
  const samples: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    await scorer.scorePairs(query, docs);
    samples.push(performance.now() - started);
  }
  return median(samples);
}

/** One `scorePairs` call per turn, each side cut to the served window the way the local-light clamp splits it. */
async function measureWorkloads(scorer: Scorer, textOf: (tokens: number, salt: string) => string, served: number): Promise<WorkloadRow[]> {
  const rows: WorkloadRow[] = [];
  for (const w of WORKLOADS) {
    const queryTokens = Math.min(w.queryTokens, Math.floor(served / MIDDLE));
    const docTokens = Math.min(w.docTokens, served - queryTokens - SPECIAL_TOKENS);
    const docs = Array.from({ length: w.docs }, (_, i) => textOf(docTokens, `doc ${i}`));
    rows.push({ name: w.name, docs: w.docs, queryTokens, docTokens, msPerTurnMedian: await timeCall(scorer, textOf(queryTokens, "query"), docs) });
  }
  return rows;
}

interface Sizer {
  readonly textOf: (tokens: number, salt: string) => string;
  readonly countTokens: (text: string) => number;
}

async function measureLatency(scorer: Scorer, { textOf, countTokens }: Sizer, lengths: readonly number[], batch: number): Promise<LatencyRow[]> {
  const rows: LatencyRow[] = [];
  for (const pairTokens of lengths) {
    const query = "Which line in this scene reveals what the narrator is afraid of?";
    const docs = Array.from({ length: batch }, (_, i) => textOf(pairTokens - countTokens(query) - SPECIAL_TOKENS, String(i)));
    rows.push({ pairTokens, msPerPairMedian: Math.round((await timeCall(scorer, query, docs)) / batch), after: memory() });
  }
  return rows;
}

async function measure(): Promise<void> {
  const modelArg = argValue("model");
  const label = argValue("label");
  if (modelArg === undefined || label === undefined) {
    process.stderr.write("usage: run.ts measure --model=<hub id> --label=<name> [--cache=<dir>] [--offline]\n");
    process.exit(EXIT_MISUSE);
  }
  const model = modelIdSchema.parse(modelArg);
  const cacheDir = argValue("cache") ?? path.join(REPO, "data/cache/models/transformers");
  const batch = Number(argValue("batch") ?? DEFAULT_BATCH);
  const baseline = memory();
  const onnx = onnxFor(model);
  const cache = createModelCache({ device: "cpu", cacheDir, allowRemoteModels: !process.argv.includes("--offline"), log: silentLog, detach: () => undefined });
  const scorer: Scorer = { scorePairs: (query, documents) => cache.scorePairs(model, query, documents, onnx) };

  const loadStarted = performance.now();
  await cache.preload("rerank", model, onnx);
  const loadMs = Math.round(performance.now() - loadStarted);
  const loaded = memory();

  // The same tokenizer files the cache just loaded, read again here only to size the inputs.
  const tok = await loadTokenizer(model);
  const countTokens = (text: string): number => tok.encode(text, { add_special_tokens: false }).length;
  const textOf = (tokens: number, salt: string): string =>
    tok.decode(tok.encode(`${salt} ${fillerOf(countTokens, tokens)}`, { add_special_tokens: false }).slice(0, tokens), { skip_special_tokens: true });

  const sanity: SanityRow[] = [];
  for (const c of cases(countTokens)) {
    const [relevant = Number.NaN, irrelevant = Number.NaN] = await scorer.scorePairs(c.query, [c.relevant, c.irrelevant]);
    sanity.push({ case: c.name, relevant, irrelevant, ok: relevant > irrelevant, docTokens: countTokens(c.relevant) });
  }
  const golden = await scorer.scorePairs(GOLDEN_QUERY, GOLDEN_PASSAGES);

  const window = argValue("window");
  const workloads = window === undefined ? [] : await measureWorkloads(scorer, textOf, Number(window));
  const lengthsArg = argValue("lengths");
  const lengths = lengthsArg === "none" ? [] : (lengthsArg?.split(",").map(Number) ?? PAIR_TOKENS);
  const latency = await measureLatency(scorer, { textOf, countTokens }, lengths, batch);

  const peak = memory().hwmMib;
  const row = {
    label,
    batch,
    model,
    onnx: onnx ?? null,
    threads: localLightCpuThreads(),
    loadMs,
    rss: { baselineMib: baseline.rssMib, afterLoadMib: loaded.rssMib, peakMib: peak, peakOverBaselineMib: peak - baseline.rssMib },
    sanity,
    golden,
    window: window === undefined ? null : Number(window),
    workloads,
    latency,
    heapMib: Math.round(process.memoryUsage().heapUsed / MIB),
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(path.join(RESULTS_DIR, `${label}.json`), `${JSON.stringify(row, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(row)}\n`);
  if (![...golden, ...sanity.flatMap((c) => [c.relevant, c.irrelevant])].every(Number.isFinite)) {
    process.stderr.write("a score is not finite: the head or the weights are broken\n");
    process.exitCode = 1;
  }
}

if (process.argv[2] === "measure") {
  await measure();
} else {
  process.stderr.write("usage: run.ts measure --model=<hub id> --label=<name>\n");
  process.exit(EXIT_MISUSE);
}
