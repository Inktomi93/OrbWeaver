#!/usr/bin/env node
/**
 * guard-replay.mjs — READ-ONLY validation harness for the PreToolUse guard
 * (`.claude/hooks/tool-guard.mjs`): replays the guard's REAL classifier over every Bash
 * `tool_use` command in every Claude Code transcript on this box (the same corpus
 * `transcript-census.mjs` measured: 3,138 files / 4.5 GB / 133,631 Bash calls as of
 * 2026-08-03) and reports, per rule: how many commands it would have hit, the main/subagent
 * split, and a seeded-random sample for human false-positive review.
 *
 * This is the evidence a rule ships on. A rule that cannot be defended against this replay
 * does not ship — re-run it whenever the ruleset is retuned:
 *
 *   node scripts/probes/guard-replay.mjs --out reports/guard-replay.json
 *
 * Extraction mirrors transcript-census.mjs (streaming readline + cheap substring pre-filter
 * before JSON.parse — that miner's header documents the transcript shape). Classification is
 * NOT re-derived: it imports `classify` from the hook itself, so what is measured is exactly
 * what will run. Replay context: subagent lines get a synthetic agentId (so lane-scoped rules
 * engage), projectDir is pinned to /repo (deterministic rewrite text), and the push-in-flight
 * /proc scan is pointed at a nonexistent root (deterministic: never fires).
 */

import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { classify } from "../../.claude/hooks/tool-guard.mjs";

const DEFAULT_SAMPLES_PER_BUCKET = 15;
const PROGRESS_EVERY_N_FILES = 200;
const SAMPLE_COMMAND_MAX_CHARS = 220;
const REPLAY_NOW_MS = 1_700_000_000_000; // fixed → rewrite log names are stable across runs
const LCG_MULTIPLIER = 1_103_515_245;
const LCG_INCREMENT = 12_345;
const LCG_MODULUS = 2_147_483_648;
const LCG_SEED = 42;

function argVal(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const argv = process.argv.slice(2);
const HOME = os.homedir();
const roots = argVal(argv, "roots", `${HOME}/.claude/projects,${HOME}/.claude-b/projects`)
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const SAMPLES_PER_BUCKET = Number(argVal(argv, "samples", String(DEFAULT_SAMPLES_PER_BUCKET)));
const OUT_FILE = argVal(argv, "out", null);

const REPLAY_CTX_BASE = {
  projectDir: "/repo",
  now: REPLAY_NOW_MS,
  procRoot: "/nonexistent-proc-root",
};

// deterministic PRNG → reproducible reservoir samples across runs
let lcgState = LCG_SEED;
function nextRandom() {
  lcgState = (lcgState * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
  return lcgState / LCG_MODULUS;
}

const GIT_REMOTE_TOUCH = /\bgit\s+(?:[^\s;|&]+\s+)*?(?:push|fetch|pull)\b/;
const LOOKS_LIKE_BASH_USE_NAME = '"name":"Bash"';
const LOOKS_LIKE_TOOL_USE = '"tool_use"';

const stats = {
  filesScanned: 0,
  bashCallsTotal: 0,
  bashCallsMain: 0,
  bashCallsSubagent: 0,
  buckets: {}, // `${rule}|${decision}` -> {rule, decision, total, main, subagent, seen, samples[]}
  advisoryContextTotals: {}, // first-line-of-context -> count (which warn fired, since rule id is "advisory")
  gitRemoteTouch: { total: 0, main: 0, subagent: 0 },
};

function bucketFor(rule, decision) {
  const key = `${rule}|${decision}`;
  stats.buckets[key] ??= { rule, decision, total: 0, main: 0, subagent: 0, seen: 0, samples: [] };
  return stats.buckets[key];
}

function reservoirAdd(bucket, sample) {
  bucket.seen += 1;
  if (bucket.samples.length < SAMPLES_PER_BUCKET) {
    bucket.samples.push(sample);
    return;
  }
  const slot = Math.floor(nextRandom() * bucket.seen);
  if (slot < SAMPLES_PER_BUCKET) {
    bucket.samples[slot] = sample;
  }
}

function truncate(cmd) {
  return cmd.length > SAMPLE_COMMAND_MAX_CHARS ? `${cmd.slice(0, SAMPLE_COMMAND_MAX_CHARS)}…` : cmd;
}

const ADVISORY_HEADLINE_MAX = 60;

function recordAdvisoryHeadlines(contexts) {
  for (const c of contexts) {
    const dashIdx = c.indexOf(" — ");
    const headline = c.slice(0, dashIdx === -1 ? ADVISORY_HEADLINE_MAX : dashIdx);
    stats.advisoryContextTotals[headline] = (stats.advisoryContextTotals[headline] ?? 0) + 1;
  }
}

function classifySafe(cmd, ctx) {
  try {
    return classify(cmd, ctx);
  } catch (err) {
    return { decision: "defer", rule: "classifier-error", contexts: [String(err)] };
  }
}

function recordCommand(cmd, scope, cwd) {
  stats.bashCallsTotal += 1;
  stats[scope === "main" ? "bashCallsMain" : "bashCallsSubagent"] += 1;
  if (GIT_REMOTE_TOUCH.test(cmd)) {
    stats.gitRemoteTouch.total += 1;
    stats.gitRemoteTouch[scope] += 1;
  }
  const ctx = { ...REPLAY_CTX_BASE, cwd: cwd ?? "/repo", agentId: scope === "subagent" ? "replay-agent" : null };
  const result = classifySafe(cmd, ctx);
  const rule = result.rule ?? "none";
  const bucket = bucketFor(rule, result.decision);
  bucket.total += 1;
  bucket[scope] += 1;
  if (rule !== "none") {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: false positive — classify's union has rewrite-less arms (deny/ask/defer); biome's type lens can't see the cross-file .mjs union.
    const rewrittenTo = typeof result.rewrite?.command === "string" ? truncate(result.rewrite.command) : undefined;
    reservoirAdd(bucket, { command: truncate(cmd), scope, rewrittenTo });
  }
  if (rule === "advisory") {
    recordAdvisoryHeadlines(result.contexts);
  }
}

async function findJsonlFiles(root) {
  const out = [];
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if ((e.isFile() || e.isSymbolicLink()) && e.name.endsWith(".jsonl")) {
      out.push(path.join(e.parentPath ?? e.path, e.name));
    }
  }
  return out;
}

function handleLine(line) {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return;
  }
  if (rec.type !== "assistant" || !Array.isArray(rec.message?.content)) {
    return;
  }
  for (const item of rec.message.content) {
    if (item.type === "tool_use" && item.name === "Bash" && typeof item.input?.command === "string") {
      recordCommand(item.input.command, rec.isSidechain ? "subagent" : "main", rec.cwd);
    }
  }
}

async function processFile(file) {
  stats.filesScanned += 1;
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of rl) {
    if (line.includes(LOOKS_LIKE_BASH_USE_NAME) && line.includes(LOOKS_LIKE_TOOL_USE)) {
      handleLine(line);
    }
  }
}

const COL_RULE = 22;
const COL_DECISION = 9;
const COL_TOTAL = 8;
const COL_MAIN = 7;

function printReport() {
  const rows = Object.values(stats.buckets).sort((a, b) => b.total - a.total);
  const pad = (s, n) => String(s).padEnd(n);
  const g = stats.gitRemoteTouch;
  const corpusLine = `\ncorpus: ${stats.bashCallsTotal} Bash calls (${stats.bashCallsMain} main / ${stats.bashCallsSubagent} subagent) across ${stats.filesScanned} files\n`;
  process.stdout.write(corpusLine);
  process.stdout.write(`git remote-touching commands (push/fetch/pull): ${g.total} (${g.main} main / ${g.subagent} subagent)\n\n`);
  process.stdout.write(`${pad("RULE", COL_RULE)} ${pad("DECISION", COL_DECISION)} ${pad("TOTAL", COL_TOTAL)} ${pad("MAIN", COL_MAIN)} SUBAGENT\n`);
  for (const r of rows) {
    process.stdout.write(`${pad(r.rule, COL_RULE)} ${pad(r.decision, COL_DECISION)} ${pad(r.total, COL_TOTAL)} ${pad(r.main, COL_MAIN)} ${r.subagent}\n`);
  }
  process.stdout.write("\nadvisory contexts by headline:\n");
  for (const [k, v] of Object.entries(stats.advisoryContextTotals).sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${pad(v, COL_MAIN)} ${k}\n`);
  }
}

async function main() {
  const found = await Promise.all(roots.map(findJsonlFiles));
  const files = found.flat();
  process.stderr.write(`guard-replay: scanning ${files.length} files across ${roots.length} roots\n`);
  let done = 0;
  for (const f of files) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential BY DESIGN — one transcript in memory at a time bounds peak memory across a 4.5GB corpus (same rationale as transcript-census.mjs).
    await processFile(f);
    done += 1;
    if (done % PROGRESS_EVERY_N_FILES === 0) {
      process.stderr.write(`  ...${done}/${files.length}\n`);
    }
  }
  printReport();
  if (OUT_FILE) {
    await writeFile(OUT_FILE, JSON.stringify(stats, null, 2));
    process.stderr.write(`wrote ${OUT_FILE}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
