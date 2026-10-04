// Replays the app's recorded folded-turn requests (`capture-app-requests.ts`) against a live server, each beat
// N times per stream mode, with the history and state fixed by the recording. Writes one JSON line per reply to
// `<out>/<cell>.jsonl`; `replay-summary.ts` turns those into the per-beat table.
//
//   node scripts/probes/prose-with-tools/replay.ts --cell=<name> --base=http://127.0.0.1:<port>/v1 --model=<id>
//        --bodies=<recorded dir> --out=<dir> [--reps=10] [--modes=stream,nonstream] [--parallel=4]
//        [--override=<json merged into every body, e.g. {"temperature":0,"seed":42}>]

import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const MODES = ["stream", "nonstream"] as const;
type Mode = (typeof MODES)[number];
type Shape = "both" | "prose-only" | "tools-only" | "empty";

const REQUEST_TIMEOUT_MS = 900_000;
const DEFAULT_REPS = 10;
const DEFAULT_PARALLEL = 4;
/** Below this many characters a reply is not prose: a stray newline or a one-word stub before a call. */
const PROSE_MIN_CHARS = 40;
const THINK_BLOCK_RE = /<think>[\s\S]*?(<\/think>|$)/g;
/** Tool-call markup that reached `content` unparsed: the server lost the call and the prose count lies. */
const LEAKED_CALL_RE = /<tool_call>|<function=|<\/?parameter|"name"\s*:\s*"(update_|set_tracker|upsert_quest|add_journal_entry|no_changes)/;
const ERROR_EXCERPT_CHARS = 400;

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function required(name: string): string {
  const value = arg(name);
  if (value === undefined || value === "") {
    throw new Error(`--${name}=<value> is required (see the file header)`);
  }
  return value;
}

const CELL = required("cell");
const BASE = required("base").replace(/\/$/, "");
const MODEL = required("model");
const BODIES = required("bodies");
const OUT = required("out");
const REPS = Number.parseInt(arg("reps") ?? String(DEFAULT_REPS), 10);
const PARALLEL = Number.parseInt(arg("parallel") ?? String(DEFAULT_PARALLEL), 10);
const RUN_MODES = (arg("modes") ?? MODES.join(",")).split(",") as Mode[];
const OVERRIDE = JSON.parse(arg("override") ?? "{}") as Record<string, unknown>;

interface Delta {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[];
}
interface CompletionJson {
  error?: unknown;
  choices?: { message?: Delta; delta?: Delta; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}
interface Reply {
  content: string;
  reasoning: string;
  calls: string[];
  finish: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

const reasoningOf = (d: Delta): string => d.reasoning_content ?? d.reasoning ?? "";

async function post(body: Record<string, unknown>): Promise<Response> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok || res.body === null) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, ERROR_EXCERPT_CHARS)}`);
  }
  return res;
}

async function nonStream(body: Record<string, unknown>): Promise<Reply> {
  const json = (await (await post({ ...body, stream: false, stream_options: undefined })).json()) as CompletionJson;
  const choice = json.choices?.[0];
  const message = choice?.message ?? {};
  return {
    content: message.content ?? "",
    reasoning: reasoningOf(message),
    calls: (message.tool_calls ?? []).map((c) => c.function?.name ?? ""),
    finish: choice?.finish_reason ?? "",
    promptTokens: json.usage?.prompt_tokens ?? null,
    completionTokens: json.usage?.completion_tokens ?? null,
  };
}

function foldChunk(reply: Reply, names: Map<number, string>, data: string): void {
  if (data === "[DONE]") {
    return;
  }
  const json = JSON.parse(data) as CompletionJson;
  // A server that fails mid-stream (llama.cpp's "Context size has been exceeded.") sends an error frame and
  // stops; without this the reply reads as an empty turn instead of an invalid one.
  if (json.error !== undefined) {
    throw new Error(`stream error: ${JSON.stringify(json.error).slice(0, ERROR_EXCERPT_CHARS)}`);
  }
  reply.promptTokens = json.usage?.prompt_tokens ?? reply.promptTokens;
  reply.completionTokens = json.usage?.completion_tokens ?? reply.completionTokens;
  const choice = json.choices?.[0];
  if (choice === undefined) {
    return;
  }
  reply.finish = choice.finish_reason ?? reply.finish;
  const delta = choice.delta ?? {};
  reply.content += delta.content ?? "";
  reply.reasoning += reasoningOf(delta);
  for (const [position, call] of (delta.tool_calls ?? []).entries()) {
    const index = call.index ?? position;
    names.set(index, (names.get(index) ?? "") + (call.function?.name ?? ""));
  }
}

async function stream(body: Record<string, unknown>): Promise<Reply> {
  const res = await post({ ...body, stream: true, stream_options: { include_usage: true } });
  const reply: Reply = { content: "", reasoning: "", calls: [], finish: "", promptTokens: null, completionTokens: null };
  const names = new Map<number, string>();
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body ?? []) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.map((l) => l.trim()).filter((l) => l.startsWith("data:"))) {
      foldChunk(reply, names, line.slice("data:".length).trim());
    }
  }
  if (reply.finish === "") {
    throw new Error("the stream ended without a finish_reason");
  }
  reply.calls = [...names.entries()].sort(([a], [b]) => a - b).map(([, name]) => name);
  return reply;
}

const SHAPES: Readonly<Record<`${boolean}:${boolean}`, Shape>> = {
  "true:true": "both",
  "true:false": "prose-only",
  "false:true": "tools-only",
  "false:false": "empty",
};

interface Job {
  readonly beat: number;
  readonly mode: Mode;
  readonly rep: number;
  readonly body: Record<string, unknown>;
}

async function runJob(job: Job): Promise<Record<string, unknown>> {
  const started = performance.now();
  try {
    const reply = job.mode === "stream" ? await stream(job.body) : await nonStream(job.body);
    const prose = reply.content.replace(THINK_BLOCK_RE, "").trim();
    return {
      cell: CELL,
      beat: job.beat,
      mode: job.mode,
      rep: job.rep,
      shape: SHAPES[`${prose.length >= PROSE_MIN_CHARS}:${reply.calls.length > 0}`],
      proseChars: prose.length,
      reasoningChars: reply.reasoning.length,
      calls: reply.calls,
      leak: LEAKED_CALL_RE.test(reply.content),
      finish: reply.finish,
      promptTokens: reply.promptTokens,
      completionTokens: reply.completionTokens,
      ms: Math.round(performance.now() - started),
      content: reply.content,
    };
  } catch (err) {
    return { cell: CELL, beat: job.beat, mode: job.mode, rep: job.rep, shape: "empty", error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const files = readdirSync(BODIES)
    .filter((f) => f.startsWith("turn-"))
    .sort();
  const jobs: Job[] = [];
  for (const mode of RUN_MODES) {
    for (const [index, file] of files.entries()) {
      const recorded = JSON.parse(readFileSync(path.join(BODIES, file), "utf8")) as Record<string, unknown>;
      for (let rep = 1; rep <= REPS; rep++) {
        jobs.push({ beat: index + 1, mode, rep, body: { ...recorded, model: MODEL, ...OVERRIDE } });
      }
    }
  }
  const outFile = path.join(OUT, `${CELL}.jsonl`);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let job = jobs[next++]; job !== undefined; job = jobs[next++]) {
      const row = await runJob(job);
      appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      process.stdout.write(
        `  ${CELL} ${job.mode} beat ${job.beat} rep ${job.rep}: ${String(row["shape"])}${row["error"] === undefined ? "" : ` ERROR ${String(row["error"])}`}\n`,
      );
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  process.stdout.write(`wrote ${outFile}\n`);
}

await main();
