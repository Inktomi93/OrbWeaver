// Browser-free immutable index reader: never imports Playwright or opens a browser/run slot.
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { checkoutName, print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { parseSnapRunResults, snapDiagnosticRetention } from "../contract/run-facts.ts";
import type { SnapPrunedRun, SnapReportQuery, SnapRunArtifact, SnapRunIndex, SnapRunListQuery } from "../contract/run-index.ts";
import { assertArtifactReferences, assertArtifactRow } from "../lib/run-index-artifacts.ts";
import { directSnapRunIndexCandidates, localSnapRunIndexPaths, snapWorktreeRoots } from "../lib/run-report-candidates.ts";
import { runOutName, runRegressions } from "../lib/run-report-columns.ts";
import { ARM_DEFS } from "./arms/registry.ts";
import { readSnapDiagnosticArtifact } from "./run-bundle.ts";
import { assertIndex } from "./run-report-index-assert.ts";
import { normalizeLegacyIndex } from "./run-report-legacy.ts";
import type { SnapRunIndexScan } from "./run-report-render.ts";
import { renderSnapRunDelta, renderSnapRunList, renderSnapRunReport } from "./run-report-render.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

async function assertArtifactFile(value: SnapRunArtifact, indexPath: string): Promise<void> {
  try {
    const observed = await stat(value.path);
    if (observed.size !== value.bytes) {
      throw new Error(`size changed from ${value.bytes} to ${observed.size}`);
    }
  } catch (error) {
    throw new Error(`${indexPath} references stale artifact ${value.path} (${error instanceof Error ? error.message : String(error)})`, { cause: error });
  }
}

async function assertDiagnosticPopulation(index: SnapRunIndex, path: string): Promise<void> {
  const reads = await Promise.all(index.diagnostics.recordArtifacts.map(readSnapDiagnosticArtifact));
  const records = reads.flatMap((artifact) => artifact.records);
  const limitEvents = reads.reduce((sum, artifact) => sum + artifact.limitEvents, 0);
  if (records.length !== index.diagnostics.records.total) {
    throw new Error(`${path} diagnostic population changed from ${String(index.diagnostics.records.total)} to ${String(records.length)}`);
  }
  if (limitEvents !== index.diagnostics.records.limitEvents || index.diagnostics.records.complete !== (limitEvents === 0)) {
    throw new Error(`${path} diagnostic measured-limit receipt changed from ${String(index.diagnostics.records.limitEvents)} to ${String(limitEvents)}`);
  }
  const absent =
    index.diagnostics.totals === null &&
    index.diagnostics.reads.length === 0 &&
    index.diagnostics.recordArtifacts.length === 0 &&
    index.diagnostics.records.total === 0;
  const complete = index.diagnostics.totals?.complete === true && index.diagnostics.records.complete && snapDiagnosticRetention(index.results).complete;
  if ((index.diagnostics.state === "absent" && !absent) || (index.diagnostics.state === "complete" && !complete)) {
    throw new Error(`${path} diagnostic completeness state disagrees with its measured populations`);
  }
  if (index.diagnostics.counts !== undefined && index.diagnostics.counts.reduce((sum, row) => sum + row.records, 0) !== records.length) {
    throw new Error(`${path} diagnostic identity counts disagree with their raw population`);
  }
}

function assertFactProvenance(index: SnapRunIndex, path: string): void {
  if (index.results === undefined) {
    return;
  }
  for (const fact of index.results.batches.flatMap((batch) => batch.arms)) {
    const expected = ARM_DEFS[fact.arm].result;
    if (fact.schema !== expected.schema || fact.source !== expected.source || fact.lifetime !== expected.lifetime) {
      throw new Error(`${path} ${fact.arm} fact provenance/schema disagrees with its ArmDef`);
    }
  }
}

export async function readSnapRunIndex(path: string): Promise<SnapRunIndex> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is missing or corrupt (${error instanceof Error ? error.message : String(error)})`, { cause: error });
  }
  const normalized = normalizeLegacyIndex(parsed);
  assertIndex(normalized, path);
  const index: SnapRunIndex = normalized.results === undefined ? normalized : { ...normalized, results: parseSnapRunResults(normalized.results) };
  for (const artifact of index.artifacts) {
    assertArtifactRow(artifact, path);
    await assertArtifactFile(artifact, path);
  }
  assertArtifactReferences(index, path);
  assertFactProvenance(index, path);
  await assertDiagnosticPopulation(index, path);
  return index;
}

async function latestIndex(root: string): Promise<string | null> {
  const candidates = await Promise.all(
    (await localSnapRunIndexPaths(root)).map(async (path) => {
      const index = await readSnapRunIndex(path);
      return { path, finishedAt: index.process.finishedAt };
    }),
  );
  return candidates.sort((left, right) => right.finishedAt.localeCompare(left.finishedAt))[0]?.path ?? null;
}

export async function resolveSnapRunIndex(root: string, target: string): Promise<string> {
  if (target === "latest") {
    const path = await latestIndex(root);
    if (path === null) {
      throw new Error(`latest has no completed Snap run for checkout ${checkoutName(root)}`);
    }
    return path;
  }
  if (isAbsolute(target) || target.includes("/") || target.endsWith(".json")) {
    return resolve(root, target);
  }
  const candidates = await directSnapRunIndexCandidates(root, target);
  if (candidates.length === 0) {
    // A run id outlives its bytes: it is quoted in reviews, board rows and `next=` commands long after the
    // retention sweep. Say which of the two it is rather than leaving the reader to suspect a typo.
    throw new Error(
      `run id ${JSON.stringify(target)} was not found in any registered worktree — a run slot is kept for at least 24h, after which only the newest 10 per instrument survive; pnpm snap --reports lists the pruned ones`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(`run id ${JSON.stringify(target)} is ambiguous across worktrees: ${candidates.join(", ")}`);
  }
  const [candidate] = candidates;
  if (candidate === undefined) {
    throw new Error(`run id ${JSON.stringify(target)} disappeared after candidate resolution`);
  }
  return candidate;
}

/** The PREVIOUS run of the same `--out` name in this checkout, if there is one.
 *
 *  Deliberately a LENIENT read: the delta is a display convenience, so one corrupt neighbour must not
 *  refuse the report the caller actually asked for. The subject index itself is still read by the strict
 *  door above — nothing here can turn a malformed file into a verdict. */
async function previousRunWithSameName(root: string, current: SnapRunIndex): Promise<SnapRunIndex | null> {
  const name = runOutName(current);
  let best: SnapRunIndex | null = null;
  for (const path of await localSnapRunIndexPaths(root)) {
    // @orb-waive caught-failure-ownership(catch): a neighbouring run's corruption is not this report's verdict — the subject index is read by the strict door in printSnapReport, and a skipped neighbour only means no delta row. Ends if this reader becomes the only read of those files.
    try {
      const candidate = await readSnapRunIndex(path);
      const older = candidate.process.finishedAt < current.process.finishedAt;
      const newest = best === null || candidate.process.finishedAt > best.process.finishedAt;
      if (candidate.identity.runId !== current.identity.runId && older && newest && runOutName(candidate) === name) {
        best = candidate;
      }
    } catch {
      /* a neighbour we cannot read is simply not a comparison subject */
    }
  }
  return best;
}

export async function printSnapReport(root: string, query: SnapReportQuery): Promise<number> {
  // @orb-waive caught-failure-ownership(error): this is the browser-free reader's terminal owner; it prints RUN INDEX REFUSED and returns tool-error for every resolution/validation/artifact failure. Ends if either output or exit vote disappears.
  try {
    const path = await resolveSnapRunIndex(root, query.target);
    const index = await readSnapRunIndex(path);
    await renderSnapRunReport(index, path, query);
    const previous = await previousRunWithSameName(root, index);
    if (previous !== null) {
      renderSnapRunDelta(index, previous, runRegressions(index, previous));
    }
    return EXIT.clean;
  } catch (error) {
    print(`RUN INDEX REFUSED  ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.toolError;
  }
}

async function scanSnapRunIndices(root: string): Promise<SnapRunIndexScan> {
  const rows: SnapRunIndex[] = [];
  const invalid: { path: string; reason: string }[] = [];
  let scanned = 0;
  for (const worktree of snapWorktreeRoots(root)) {
    for (const path of await localSnapRunIndexPaths(worktree)) {
      scanned += 1;
      // @orb-waive caught-failure-ownership(error): list mode retains path+reason in `invalid` and `printSnapReports` emits the bounded aggregate; the strict single-index reader remains the detailed refusal door. Ends if either retention or aggregate output disappears.
      try {
        rows.push(await readSnapRunIndex(path));
      } catch (error) {
        invalid.push({ path, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { rows: rows.toSorted((left, right) => right.process.finishedAt.localeCompare(left.process.finishedAt)), invalid, scanned };
}

export async function listSnapRunIndices(root: string): Promise<readonly SnapRunIndex[]> {
  return (await scanSnapRunIndices(root)).rows;
}

export async function printSnapReports(
  root: string,
  query: SnapRunListQuery = { last: null, lane: null },
  pruned: readonly SnapPrunedRun[] = [],
): Promise<number> {
  const scan = await scanSnapRunIndices(root);
  renderSnapRunList(scan, query, pruned);
  return EXIT.clean;
}
