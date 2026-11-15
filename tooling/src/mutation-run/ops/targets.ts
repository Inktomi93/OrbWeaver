// `pnpm test:mutation:targets`: the start-up check, then one `pnpm test:mutation` run per target through the same
// slot and sandbox, a kept report per target, and one table. Manual only: D333 keeps mutation runs out of every gate.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { print } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { thrownOutcome } from "../../floor/cli/run-tool.ts";
import { spawnNiced } from "../../floor/process/proc.ts";
import type { CandidateSort, HotspotRow } from "../lib/candidates.ts";
import { CANDIDATE_DEPTH, CANDIDATE_PATH, CANDIDATE_SORTS, compareCandidates, rankCandidates } from "../lib/candidates.ts";
import type { CheckedTarget, TargetOutcome } from "../lib/target-plan.ts";
import { aggregateExit, checkTargets, formatTargetTable, parseTargetArgs, selectTargets, TARGET_REPORT_DIR, TARGET_TABLE_FILE } from "../lib/target-plan.ts";
import type { TestCorpus } from "../lib/target-tests.ts";
import { findTargetTests, readTestCorpus } from "../lib/target-tests.ts";
import { MUTATION_TARGETS } from "../lib/targets.ts";
import type { KeptReport } from "./run.ts";
import { runMutationPlan } from "./run.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:mutation:targets");

const STOP_SIGNALS = ["SIGINT", "SIGTERM"] as const;
const HOTSPOTS_SCRIPT = "scripts/hotspots.ts";
const JSON_LINE = "[";

function keptReport(file: string): KeptReport {
  const stem = join(TARGET_REPORT_DIR, file.replaceAll("/", "__"));
  return { json: `${stem}.json`, html: `${stem}.html` };
}

function testsLine({ found }: CheckedTarget): string {
  return `${found.sources.join("+")} (${String(found.tests.length)}): ${found.tests.join(", ")}`;
}

function listTargets(checked: readonly CheckedTarget[]): number {
  for (const entry of checked) {
    print(`${entry.target.file}\n  ${entry.target.reason}\n  tests ${testsLine(entry)}`);
  }
  return EXIT.clean;
}

async function runOne(entry: CheckedTarget, root: string, signal: AbortSignal): Promise<TargetOutcome> {
  const keep = keptReport(entry.target.file);
  // A failed run must not leave the last pass's report under this target's name.
  rmSync(join(root, keep.json), { force: true });
  rmSync(join(root, keep.html), { force: true });
  print(`\n== ${entry.target.file} (tests ${testsLine(entry)})`);
  try {
    const { exit, counts } = await runMutationPlan(entry.plan, root, { keep, signal });
    return { file: entry.target.file, exit, counts, report: counts === null ? null : keep.json };
  } catch (error) {
    if (signal.aborted) {
      return { file: entry.target.file, exit: EXIT.toolError, counts: null, report: null };
    }
    const { code, line } = thrownOutcome(error);
    print(line);
    return { file: entry.target.file, exit: code, counts: null, report: null };
  }
}

async function runTargets(checked: readonly CheckedTarget[], root: string): Promise<number> {
  const stop = new AbortController();
  const onSignal = (): void => stop.abort();
  for (const signal of STOP_SIGNALS) {
    process.on(signal, onSignal);
  }
  const outcomes: TargetOutcome[] = [];
  // A function, not a property read: the signal flips while a run is awaited, which narrowing cannot see.
  const stopped = (): boolean => stop.signal.aborted;
  try {
    for (const entry of checked) {
      if (stopped()) {
        break;
      }
      const outcome = await runOne(entry, root, stop.signal);
      // A target the stop cut short is no result; the table holds only targets that finished.
      if (!stopped()) {
        outcomes.push(outcome);
      }
    }
  } finally {
    for (const signal of STOP_SIGNALS) {
      process.off(signal, onSignal);
    }
  }
  const table = formatTargetTable(outcomes);
  mkdirSync(dirname(join(root, TARGET_TABLE_FILE)), { recursive: true });
  writeFileSync(join(root, TARGET_TABLE_FILE), `${table}\n`);
  const complete = outcomes.length === checked.length;
  print(`\n${table}`);
  if (!complete) {
    print(`stopped: ${String(checked.length - outcomes.length)} of ${String(checked.length)} targets did not finish`);
  }
  print(`table: ${TARGET_TABLE_FILE}`);
  return aggregateExit(
    outcomes.map(({ exit }) => exit),
    complete,
  );
}

async function hotspotRanking(sort: CandidateSort, root: string): Promise<readonly HotspotRow[]> {
  const args = [HOTSPOTS_SCRIPT, "--sort", sort, "--path", CANDIDATE_PATH, "--top", String(CANDIDATE_DEPTH), "--json"];
  const { code, stdout, stderr, timedOut } = await spawnNiced(process.execPath, args, { cwd: root });
  const json = stdout.split("\n").find((line) => line.startsWith(JSON_LINE));
  if (code !== EXIT.clean || timedOut || json === undefined) {
    throw new Error(`${HOTSPOTS_SCRIPT} --sort ${sort} gave no ranking (exit ${String(code)}): ${stderr.trim()}`);
  }
  return JSON.parse(json) as readonly HotspotRow[];
}

async function printCandidates(root: string, corpus: TestCorpus): Promise<number> {
  const rankings = await Promise.all(CANDIDATE_SORTS.map(async (sort) => [sort, await hotspotRanking(sort, root)] as const));
  const ranked = rankCandidates(Object.fromEntries(rankings) as Record<CandidateSort, readonly HotspotRow[]>);
  const { missing, unranked } = compareCandidates(
    ranked,
    MUTATION_TARGETS.map(({ file }) => file),
  );
  print(`ranked files not on the list (${String(missing.length)}):`);
  for (const { path, rank, sorts } of missing) {
    const found = findTargetTests(path, corpus, root);
    const tests = found === null ? "no tests found" : `tests ${found.sources.join("+")} (${String(found.tests.length)})`;
    print(`  ${path}  rank ${String(rank)} in ${String(sorts)} sorts, ${tests}`);
  }
  print(`listed targets that no longer rank (${String(unranked.length)}):`);
  for (const path of unranked) {
    print(`  ${path}`);
  }
  return EXIT.clean;
}

export async function runMutationTargets(args: readonly string[]): Promise<number> {
  const root = process.cwd();
  const { mode, filters } = parseTargetArgs(args);
  const corpus = readTestCorpus(root);
  if (mode === "candidates") {
    return await printCandidates(root, corpus);
  }
  const checked = checkTargets(selectTargets(MUTATION_TARGETS, filters), root, corpus);
  return mode === "list" ? listTargets(checked) : await runTargets(checked, root);
}
