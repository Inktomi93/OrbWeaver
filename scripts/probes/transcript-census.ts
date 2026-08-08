#!/usr/bin/env node
/**
 * transcript-census.mjs — READ-ONLY mining pass over Claude Code session transcripts
 * (~/.claude/projects/**\/*.jsonl and ~/.claude-b/projects/**\/*.jsonl) to classify every
 * Bash tool_use call into anti-pattern buckets (exit-code-destroying pipes, bare-runner
 * dodges, destructive commands, ...) and to measure wall-clock cost by pairing each
 * tool_use with its tool_result.
 *
 * Why streaming: the corpus is multi-GB (4.5GB+ across ~3100 files as of 2026-08-03).
 * Every file is read line-by-line via readline; a line is JSON.parse'd only if a cheap
 * substring pre-filter says it might matter (the huge majority of lines are prose/thinking
 * and are skipped without parsing). Nothing is ever loaded whole into memory.
 *
 * Transcript shape notes (reverse-engineered from the corpus, not documented anywhere):
 *   - Each top-level JSONL line has "type": "assistant" | "user" | ... and "timestamp".
 *   - A Bash call is an assistant line whose message.content[] has {type:"tool_use",
 *     name:"Bash", id, input:{command, description}}.
 *   - Its result is a LATER "user" line in the SAME FILE whose message.content[] has
 *     {type:"tool_result", tool_use_id: <matches id>, content, is_error}, plus a richer
 *     sibling toolUseResult:{stdout,stderr,interrupted,...} on the same line.
 *   - Subagent transcripts live at <session>/subagents/agent-*.jsonl and carry
 *     "isSidechain": true on every line (main-session lines carry false). Some lines also
 *     carry "attributionAgent": "<role>" (not universal — treat as a bonus, not a splitter).
 *   - Bash-tool timeouts do NOT set toolUseResult.interrupted; they surface as literal text
 *     "Command timed out after <Nm Ns>" inside the tool_result content string. The
 *     tool_result still lands (late), so tool_use -> tool_result wall time for a timed-out
 *     call is a real, if capped, measurement of time lost.
 *
 * Usage:
 *   node scripts/probes/transcript-census.mjs [--roots dir1,dir2] [--examples N] [--out file.json]
 *
 * Defaults: roots = ~/.claude/projects,~/.claude-b/projects ; examples = 6 per tag ;
 * out = stdout only (pass --out to also dump the full JSON stats blob for later re-slicing).
 */

import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";

const DEFAULT_EXAMPLES_PER_TAG = 6;
const PROGRESS_EVERY_N_FILES = 200;
const EXAMPLE_COMMAND_MAX_CHARS = 300;
const MAX_TIMEOUT_EXAMPLES = 30;
const MS_PER_DAY = 86_400_000;
const ISO_WEEK_ANCHOR_DAY = 4; // Jan 4th is always in week 1 (ISO 8601)
const ISO_WEEKDAY_SUNDAY_SHIFT = 6; // shifts JS Sun(0)..Sat(6) to ISO Mon(0)..Sun(6)
const DAYS_PER_WEEK = 7;
const ISO_THURSDAY_OFFSET = 3; // Monday-of-week + 3 = Thursday, which pins the ISO week-year
const ISO_WEEK_ONE = 1;
const PERCENTILE_SCALE = 100;
const P90 = 90;

// ---- transcript JSONL shapes (reverse-engineered; see the header) ----
type Scope = "main" | "subagent";
interface ContentItem {
  type?: string;
  name?: string;
  id?: string;
  input?: { command?: string; description?: string };
  tool_use_id?: string;
  content?: unknown;
}
interface TranscriptRecord {
  type?: string;
  timestamp?: string;
  isSidechain?: boolean;
  attributionAgent?: string;
  cwd?: string;
  message?: { content?: ContentItem[] };
}
interface PendingUse {
  ts: number;
  command: string;
  description: string | null;
  scope: Scope;
  sig: string | null;
  piped: boolean | null;
}
interface TagCount {
  main: number;
  subagent: number;
  total: number;
}
interface TagExample {
  command: string;
  description: string | null;
  scope: Scope;
  file: string;
}
interface TimeoutExample {
  command: string;
  scope: Scope;
  piped: boolean;
  durationMs: number | null;
  file: string;
}
interface Timeouts {
  total: number;
  main: number;
  subagent: number;
  piped: number;
  unpiped: number;
  wallMsTotal: number;
  wallMsPiped: number;
  wallMsUnpiped: number;
  examples: TimeoutExample[];
}
interface DurationBucket {
  piped: number[];
  unpiped: number[];
}
interface Stats {
  filesScanned: number;
  linesScanned: number;
  bashCallsTotal: number;
  bashCallsMain: number;
  bashCallsSubagent: number;
  parseErrors: number;
  tagCounts: Record<string, TagCount>;
  tagExamples: Record<string, TagExample[]>;
  weekly: Record<string, Record<string, number>>;
  weeklyBashTotal: Record<string, number>;
  timeouts: Timeouts;
  durationsBySignature: Record<string, DurationBucket>;
  attributionAgentCounts: Record<string, number>;
}

function argVal(args: string[], name: string, fallback: string): string;
function argVal(args: string[], name: string, fallback: null): string | null;
function argVal(args: string[], name: string, fallback: string | null): string | null {
  const i = args.indexOf(`--${name}`);
  if (i === -1) {
    return fallback;
  }
  // biome-ignore lint/style/noNonNullAssertion: preserves the original `args[i+1]` read (undefined only if the flag is the final token).
  return args[i + 1]!;
}

const argv = process.argv.slice(2);
const HOME = os.homedir();
const roots = argVal(argv, "roots", `${HOME}/.claude/projects,${HOME}/.claude-b/projects`)
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const EXAMPLES_PER_TAG = Number(argVal(argv, "examples", String(DEFAULT_EXAMPLES_PER_TAG)));
const OUT_FILE = argVal(argv, "out", null);

// ---------------------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------------------

async function findJsonlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if ((e.isFile() || e.isSymbolicLink()) && e.name.endsWith(".jsonl")) {
      out.push(path.join(e.parentPath, e.name));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Classification helpers (heuristic, NOT a shell parser — good enough for census purposes;
// documented approximations are called out where they matter). All regexes live at module
// scope per biome's useTopLevelRegex.
// ---------------------------------------------------------------------------------------

const RE_HARNESS = /\b(?:pnpm|turbo|npm)\s+(?:run\s+)?(check|verify(?::push)?|test(?::[\w-]+)?|lint(?::[\w-]+)?|typecheck(?::[\w-]+)?|e2e(?::[\w-]+)?)\b/i;
const RE_SWALLOWER = /\|\s*(tail|head|grep|egrep|fgrep|wc|less|more|awk|sed|cut|column)\b/;
const RE_STDERR_MERGE_PIPE = /2>&1\s*\|/;
const RE_SWALLOW_FAILURE = /\|\|\s*(true|echo)\b/;
const RE_TRAILING_TRUE = /;\s*true\s*$/;
const RE_SUBSHELL_HARNESS = /\$\(\s*(?:pnpm|turbo|npm)\s+(?:run\s+)?(?:check|verify(?::push)?|test(?::[\w-]+)?|lint|typecheck|e2e)\b[^)]*\)/i;
const RE_BARE_VITEST = /\bnpx\s+vitest\b|\bvitest\s+run\b/;
const RE_BARE_TSC = /\bnpx\s+tsc\b/;
const RE_BARE_BIOME = /\bnpx\s+biome\b|\bbiome\s+(check|format)\b[^&|;]*--write\b|\bbiome\b[^&|;]*--apply\b/;
const RE_PLAYWRIGHT_TEST = /\bnpx\s+playwright\s+test\b/;
const RE_PLAYWRIGHT_CACHE_CLEAR = /rm\s+-rf\s+playwright\/\.cache/;
const RE_PLAYWRIGHT_CT_CONFIG = /playwright-ct\.config\.ts/;
const RE_BARE_DEPCRUISE_KNIP = /\bnpx\s+(depcruise|knip)\b/;
const RE_GIT_STASH = /\bgit\s+stash\b/;
const RE_GIT_RESTORE = /\bgit\s+restore\b/;
const RE_GIT_CHECKOUT_DASH_OR_DOT = /\bgit\s+checkout\s+(?:--\s|\.(?:\s|$))/;
const RE_CD_INTO_WORKTREE = /\bcd\s+[^&|;]*\.claude\/worktrees/;
const RE_BARE_SG = /(?:^|[;&|]\s*)sg\s/;
const RE_GREP_DASH_R = /\bgrep\s+-[a-zA-Z]*r[a-zA-Z]*\b/;
const RE_EXCLUDE_DIR = /--exclude-dir/;
const RE_SQLITE3 = /\bsqlite3\b/;
const RE_SQLITE3_SAFE_HINT = /\/tmp\/|test|:memory:|\.bak\b|scratchpad/i;
const RE_GIT_NO_VERIFY = /\bgit\s+(?:commit|merge)\b[^&|;]*--no-verify\b/;
const RE_GIT_PUSH_FORCE = /\bgit\s+push\b[^&|;]*(?:--force\b|-f\b)/;
const RE_GIT_ADD_ALL = /\bgit\s+add\s+(?:-A\b|\.(?:\s|$))/;
const RE_RM_RF = /\brm\s+-rf\b/;
const RE_SCRATCH_OR_TMP = /scratchpad|\/tmp\//;
const RE_NO_GPG_SIGN = /--no-gpg-sign\b/;
const RE_CURL_PIPE_SHELL = /curl[^|;&]*\|\s*(?:sh|bash)\b/;
const RE_HARNESS_SIGNATURE = /\b(pnpm|turbo|npm)\s+(?:run\s+)?([a-z0-9:_-]+)/i;
const RE_TIMED_OUT = /Command timed out after/;
const RE_CLAUSE_SPLIT = /(?:&&|;|\n)/;

function splitClauses(cmd: string): string[] {
  // Crude split on && / ; / newline. Does not respect quoting — acceptable for a census,
  // not for a hook (the hook needs a real shell tokenizer; this script is the SPEC, not it).
  return cmd.split(RE_CLAUSE_SPLIT);
}

function harnessSignature(cmd: string): string | null {
  const match = RE_HARNESS_SIGNATURE.exec(cmd);
  if (!match) {
    return null;
  }
  // biome-ignore lint/style/noNonNullAssertion: groups 1-2 are present whenever RE_HARNESS_SIGNATURE matches.
  return `${match[1]!.toLowerCase()} ${match[2]!.toLowerCase()}`;
}

function classifyHarnessClauses(cmd: string, tags: Set<string>): void {
  for (const clause of splitClauses(cmd)) {
    const match = clause.match(RE_HARNESS);
    if (!match) {
      continue;
    }
    const after = clause.slice(match.index ?? 0);
    if (RE_SWALLOWER.test(after)) {
      tags.add("A1_harness_piped_to_swallower");
    }
    if (RE_STDERR_MERGE_PIPE.test(after)) {
      tags.add("A2_stderr_merged_then_piped");
    }
    if (RE_SWALLOW_FAILURE.test(after) || RE_TRAILING_TRUE.test(clause.trim())) {
      tags.add("A3_swallow_failure_after_harness");
    }
  }
  if (RE_SUBSHELL_HARNESS.test(cmd)) {
    tags.add("A4_subshell_swallow_heuristic");
  }
}

function classifyBareRunners(cmd: string, tags: Set<string>): void {
  if (RE_BARE_VITEST.test(cmd)) {
    tags.add("B1_bare_vitest");
  }
  if (RE_BARE_TSC.test(cmd)) {
    tags.add("B2_bare_tsc");
  }
  if (RE_BARE_BIOME.test(cmd)) {
    tags.add("B3_bare_biome_or_write");
  }
  if (RE_PLAYWRIGHT_TEST.test(cmd)) {
    const sanctioned = RE_PLAYWRIGHT_CACHE_CLEAR.test(cmd) && RE_PLAYWRIGHT_CT_CONFIG.test(cmd);
    tags.add(sanctioned ? "B4_playwright_sanctioned" : "B4_playwright_unsanctioned");
  }
  if (RE_BARE_DEPCRUISE_KNIP.test(cmd)) {
    tags.add("B5_bare_depcruise_or_knip");
  }
}

function classifyFootguns(cmd: string, tags: Set<string>): void {
  if (RE_GIT_STASH.test(cmd)) {
    tags.add("C1_git_stash");
  }
  if (RE_GIT_RESTORE.test(cmd)) {
    tags.add("C2_git_restore");
  }
  if (RE_GIT_CHECKOUT_DASH_OR_DOT.test(cmd)) {
    tags.add("C3_git_checkout_dash_dash_or_dot");
  }
  if (RE_CD_INTO_WORKTREE.test(cmd)) {
    tags.add("C4_cd_into_worktree");
  }
  if (RE_BARE_SG.test(cmd)) {
    tags.add("C5_bare_sg");
  }
  if (RE_GREP_DASH_R.test(cmd) && !RE_EXCLUDE_DIR.test(cmd)) {
    tags.add("C6_grep_r_no_exclude_dir");
  }
  if (RE_SQLITE3.test(cmd)) {
    const looksLive = !RE_SQLITE3_SAFE_HINT.test(cmd);
    tags.add(looksLive ? "C7_sqlite3_live_path_likely" : "C7_sqlite3_safe_path_likely");
  }
  if (RE_GIT_NO_VERIFY.test(cmd)) {
    tags.add("C8_git_no_verify");
  }
  if (RE_GIT_PUSH_FORCE.test(cmd)) {
    tags.add("C8_git_push_force");
  }
}

function classifyExtras(cmd: string, tags: Set<string>): void {
  if (RE_GIT_ADD_ALL.test(cmd)) {
    tags.add("D1_git_add_all_or_dot");
  }
  if (RE_RM_RF.test(cmd) && !RE_SCRATCH_OR_TMP.test(cmd)) {
    tags.add("D2_rm_rf_outside_scratch_tmp");
  }
  if (RE_NO_GPG_SIGN.test(cmd)) {
    tags.add("D3_no_gpg_sign");
  }
  if (RE_CURL_PIPE_SHELL.test(cmd)) {
    tags.add("D5_curl_pipe_shell");
  }
}

function classifyCommand(cmd: string): { tags: string[]; harnessSignature: string | null; harnessPiped: boolean | null } {
  const tags = new Set<string>();
  classifyHarnessClauses(cmd, tags);
  classifyBareRunners(cmd, tags);
  classifyFootguns(cmd, tags);
  classifyExtras(cmd, tags);

  const sig = harnessSignature(cmd);
  const piped = RE_SWALLOWER.test(cmd) || RE_STDERR_MERGE_PIPE.test(cmd);
  return { tags: [...tags], harnessSignature: sig, harnessPiped: sig ? piped : null };
}

const ISO_WEEK_LABEL_PAD = 2;

function isoWeek(tsMs: number): string {
  const d = new Date(tsMs);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + ISO_THURSDAY_OFFSET - ((d.getUTCDay() + ISO_WEEKDAY_SUNDAY_SHIFT) % DAYS_PER_WEEK));
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, ISO_WEEK_ANCHOR_DAY));
  const dayDiff = (d.getTime() - week1.getTime()) / MS_PER_DAY - ISO_THURSDAY_OFFSET + ((week1.getUTCDay() + ISO_WEEKDAY_SUNDAY_SHIFT) % DAYS_PER_WEEK);
  const wk = ISO_WEEK_ONE + Math.round(dayDiff / DAYS_PER_WEEK);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(ISO_WEEK_LABEL_PAD, "0")}`;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) {
    return null;
  }
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  // biome-ignore lint/style/noNonNullAssertion: mid and mid-1 are in-bounds for a non-empty array.
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function pctl(arr: number[], p: number): number | null {
  if (arr.length === 0) {
    return null;
  }
  const s = [...arr].sort((a, b) => a - b);
  // biome-ignore lint/style/noNonNullAssertion: the index is clamped to [0, s.length-1] for a non-empty array.
  return s[Math.min(s.length - 1, Math.floor((p / PERCENTILE_SCALE) * s.length))]!;
}

// ---------------------------------------------------------------------------------------
// Stats accumulator
// ---------------------------------------------------------------------------------------

const stats: Stats = {
  filesScanned: 0,
  linesScanned: 0,
  bashCallsTotal: 0,
  bashCallsMain: 0,
  bashCallsSubagent: 0,
  parseErrors: 0,
  tagCounts: {}, // tag -> {main, subagent, total}
  tagExamples: {}, // tag -> [{command, description, scope, file}]
  weekly: {}, // tag -> {week -> count}  (only for WEEKLY_TAGS)
  weeklyBashTotal: {}, // week -> count of ALL Bash calls, for normalizing tag trend to a rate
  timeouts: { total: 0, main: 0, subagent: 0, piped: 0, unpiped: 0, wallMsTotal: 0, wallMsPiped: 0, wallMsUnpiped: 0, examples: [] },
  durationsBySignature: {}, // sig -> {piped:[ms], unpiped:[ms]}
  attributionAgentCounts: {}, // role -> count (bonus, non-universal)
};

const WEEKLY_TAGS = new Set([
  "A1_harness_piped_to_swallower",
  "A3_swallow_failure_after_harness",
  "C1_git_stash",
  "C2_git_restore",
  "B4_playwright_unsanctioned",
]);

function bump(tag: string, scope: Scope): void {
  let c = stats.tagCounts[tag];
  if (!c) {
    c = { main: 0, subagent: 0, total: 0 };
    stats.tagCounts[tag] = c;
  }
  c[scope]++;
  c.total++;
}

function recordExample(tag: string, ex: TagExample): void {
  let list = stats.tagExamples[tag];
  if (!list) {
    list = [];
    stats.tagExamples[tag] = list;
  }
  if (list.length < EXAMPLES_PER_TAG) {
    list.push(ex);
  }
}

function recordWeekly(tag: string, tsMs: number): void {
  if (!WEEKLY_TAGS.has(tag)) {
    return;
  }
  const wk = isoWeek(tsMs);
  let bucket = stats.weekly[tag];
  if (!bucket) {
    bucket = {};
    stats.weekly[tag] = bucket;
  }
  bucket[wk] = (bucket[wk] ?? 0) + 1;
}

function truncateForExample(cmd: string): string {
  return cmd.length > EXAMPLE_COMMAND_MAX_CHARS ? `${cmd.slice(0, EXAMPLE_COMMAND_MAX_CHARS)}…` : cmd;
}

// ---------------------------------------------------------------------------------------
// Per-file processing
// ---------------------------------------------------------------------------------------

function bumpAttribution(rec: TranscriptRecord): void {
  if (!rec.attributionAgent) {
    return;
  }
  stats.attributionAgentCounts[rec.attributionAgent] = (stats.attributionAgentCounts[rec.attributionAgent] ?? 0) + 1;
}

interface TagContext {
  scope: Scope;
  cmd: string;
  item: ContentItem;
  file: string;
  tsMs: number;
}
function recordTagsForCommand(tags: string[], ctx: TagContext): void {
  const { scope, cmd, item, file, tsMs } = ctx;
  for (const tag of tags) {
    bump(tag, scope);
    recordExample(tag, { command: truncateForExample(cmd), description: item.input?.description ?? null, scope, file });
    if (Number.isFinite(tsMs)) {
      recordWeekly(tag, tsMs);
    }
  }
}

function recordBashToolUseItem(rec: TranscriptRecord, file: string, pending: Map<string, PendingUse>, item: ContentItem): void {
  if (item.type !== "tool_use" || item.name !== "Bash") {
    return;
  }
  const cmd = item.input?.command;
  if (typeof cmd !== "string") {
    return;
  }
  const scope: Scope = rec.isSidechain ? "subagent" : "main";
  stats.bashCallsTotal++;
  stats[scope === "main" ? "bashCallsMain" : "bashCallsSubagent"]++;
  bumpAttribution(rec);

  const { tags, harnessSignature: sig, harnessPiped } = classifyCommand(cmd);
  const tsMs = Date.parse(rec.timestamp ?? "");
  if (Number.isFinite(tsMs)) {
    const wk = isoWeek(tsMs);
    stats.weeklyBashTotal[wk] = (stats.weeklyBashTotal[wk] ?? 0) + 1;
  }
  recordTagsForCommand(tags, { scope, cmd, item, file, tsMs });

  pending.set(item.id ?? "", {
    ts: tsMs,
    command: cmd,
    description: item.input?.description ?? null,
    scope,
    sig,
    piped: harnessPiped,
  });
}

function handleBashToolUse(rec: TranscriptRecord, file: string, pending: Map<string, PendingUse>): void {
  for (const item of rec.message?.content ?? []) {
    recordBashToolUseItem(rec, file, pending, item);
  }
}

function recordDuration(use: PendingUse, durationMs: number | null): void {
  if (!(use.sig && durationMs !== null && durationMs >= 0)) {
    return;
  }
  let bucket = stats.durationsBySignature[use.sig];
  if (!bucket) {
    bucket = { piped: [], unpiped: [] };
    stats.durationsBySignature[use.sig] = bucket;
  }
  bucket[use.piped ? "piped" : "unpiped"].push(durationMs);
}

function recordTimeout(use: PendingUse, durationMs: number | null, file: string): void {
  stats.timeouts.total++;
  stats.timeouts[use.scope === "main" ? "main" : "subagent"]++;
  const wasPiped = RE_SWALLOWER.test(use.command) || RE_STDERR_MERGE_PIPE.test(use.command);
  stats.timeouts[wasPiped ? "piped" : "unpiped"]++;
  if (durationMs !== null) {
    stats.timeouts.wallMsTotal += durationMs;
    stats.timeouts[wasPiped ? "wallMsPiped" : "wallMsUnpiped"] += durationMs;
  }
  if (stats.timeouts.examples.length < MAX_TIMEOUT_EXAMPLES) {
    stats.timeouts.examples.push({
      command: truncateForExample(use.command),
      scope: use.scope,
      piped: wasPiped,
      durationMs,
      file,
    });
  }
}

function recordToolResultItem(rec: TranscriptRecord, file: string, pending: Map<string, PendingUse>, item: ContentItem): void {
  if (item.type !== "tool_result") {
    return;
  }
  const toolUseId = item.tool_use_id;
  if (toolUseId === undefined) {
    return;
  }
  const use = pending.get(toolUseId);
  if (!use) {
    return;
  }
  pending.delete(toolUseId);

  const resultTs = Date.parse(rec.timestamp ?? "");
  const durationMs = Number.isFinite(use.ts) && Number.isFinite(resultTs) ? resultTs - use.ts : null;
  recordDuration(use, durationMs);

  const contentStr = typeof item.content === "string" ? item.content : JSON.stringify(item.content ?? "");
  if (RE_TIMED_OUT.test(contentStr)) {
    recordTimeout(use, durationMs, file);
  }
}

function handleToolResult(rec: TranscriptRecord, file: string, pending: Map<string, PendingUse>): void {
  for (const item of rec.message?.content ?? []) {
    recordToolResultItem(rec, file, pending, item);
  }
}

async function processFile(file: string): Promise<void> {
  stats.filesScanned++;
  const pending = new Map<string, PendingUse>(); // tool_use_id -> {ts, command, description, scope, sig, piped}

  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of rl) {
    stats.linesScanned++;
    if (!line) {
      continue;
    }

    // Pre-filter BEFORE JSON.parse — this is what makes a 4.5GB pass tractable.
    const looksLikeBashUse = line.includes('"name":"Bash"') && line.includes('"tool_use"');
    const looksLikeToolResult = line.includes('"tool_result"');
    if (!(looksLikeBashUse || looksLikeToolResult)) {
      continue;
    }

    let rec: TranscriptRecord;
    try {
      rec = JSON.parse(line) as TranscriptRecord;
    } catch {
      stats.parseErrors++;
      continue;
    }

    if (looksLikeBashUse && rec.type === "assistant" && Array.isArray(rec.message?.content)) {
      handleBashToolUse(rec, file, pending);
    }
    if (looksLikeToolResult && rec.type === "user" && Array.isArray(rec.message?.content)) {
      handleToolResult(rec, file, pending);
    }
  }
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------

function buildDurationSummary(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(stats.durationsBySignature).map(([sig, { piped, unpiped }]): [string, unknown] => [
      sig,
      {
        piped: { n: piped.length, medianMs: median(piped), p90Ms: pctl(piped, P90) },
        unpiped: { n: unpiped.length, medianMs: median(unpiped), p90Ms: pctl(unpiped, P90) },
      },
    ]),
  );
}

async function main(): Promise<void> {
  const found = await Promise.all(roots.map(findJsonlFiles));
  const files = found.flat();
  process.stderr.write(`transcript-census: scanning ${files.length} files across ${roots.length} roots\n`);

  let done = 0;
  for (const f of files) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential BY DESIGN — a per-file pending Map bounds memory to one transcript at a time; parallel reads would multiply peak memory across a 4.5GB corpus.
    await processFile(f);
    done++;
    if (done % PROGRESS_EVERY_N_FILES === 0) {
      process.stderr.write(`  ...${done}/${files.length}\n`);
    }
  }

  const summary = { ...stats, durationSummaryBySignature: buildDurationSummary() };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (OUT_FILE) {
    await writeFile(OUT_FILE, JSON.stringify(summary, null, 2));
    process.stderr.write(`wrote ${OUT_FILE}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
