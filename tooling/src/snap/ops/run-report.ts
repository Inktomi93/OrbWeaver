// Browser-free immutable index reader: never imports Playwright or opens a browser/run slot.
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { evidenceWindowIdSchema, instrumentEvidenceScopeSchema } from "../../_shared/artifact-scope.ts";
import { checkoutName, print } from "../../_shared/artifacts.ts";
import { DIAGNOSTIC_LEVELS } from "../../_shared/browser-diagnostics.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { parseSnapRunResults, SNAP_ARM_STATES, snapDiagnosticRetention } from "../contract/run-facts.ts";
import type { SnapPrunedRun, SnapReportQuery, SnapRunArtifact, SnapRunIndex, SnapRunListQuery } from "../contract/run-index.ts";
import { assertArtifactReferences, assertArtifactRow } from "../lib/run-index-artifacts.ts";
import { directSnapRunIndexCandidates, localSnapRunIndexPaths, snapWorktreeRoots } from "../lib/run-report-candidates.ts";
import { runOutName, runRegressions } from "../lib/run-report-columns.ts";
import { checkoutLocation, isRecord, validGitFailures } from "../lib/run-report-identity.ts";
import { ARM_DEFS } from "./arms/registry.ts";
import { readSnapDiagnosticArtifact } from "./run-bundle.ts";
import { normalizeLegacyIndex } from "./run-report-legacy.ts";
import type { SnapRunIndexScan } from "./run-report-render.ts";
import { renderSnapRunDelta, renderSnapRunList, renderSnapRunReport } from "./run-report-render.ts";
import { isStringOrNull, isStringPair } from "./run-report-shapes.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

const ARM_STATES = new Set(SNAP_ARM_STATES);
const VERDICT_STATES = new Set(["passed", "failed", "refused"]);
const STAGE_KINDS = new Set(["live", "isolated", "session"]);
const DIAGNOSTIC_STATES = new Set(["complete", "incomplete", "absent"]);
const FINDING_SEVERITIES = new Set(["error", "warning", "annotation"]);
const FINDING_COMPLETENESS = new Set(["complete", "bounded", "incomplete"]);
function hasGitFailure(value: readonly { readonly field: string }[], field: string): boolean {
  return value.some((failure) => failure.field === field);
}

function assertGitIdentity(value: Readonly<Record<string, unknown>>, path: string): void {
  const dirty = value["dirty"];
  const failures = value["gitFailures"];
  const dirtyState = isRecord(dirty) ? String(dirty["state"]) : "";
  const digest = isRecord(dirty) ? dirty["digest"] : undefined;
  const validDirty =
    dirtyState === "clean" || dirtyState === "dirty"
      ? /^[0-9a-f]{64}$/u.test(String(digest))
      : dirtyState === "unknown" && digest === null && Array.isArray(failures) && failures.length > 0;
  if (!(isRecord(dirty) && validGitFailures(failures) && validDirty)) {
    throw new Error(`${path} has malformed dirty identity`);
  }
  if (
    Array.isArray(failures) &&
    ((value["sha"] === "unavailable" && !hasGitFailure(failures, "sha")) || (value["ref"] === "unavailable" && !hasGitFailure(failures, "ref")))
  ) {
    throw new Error(`${path} has unowned Git identity failure`);
  }
}

function assertIdentity(value: unknown, path: string): asserts value is SnapRunIndex["identity"] {
  if (!isRecord(value)) {
    throw new Error(`${path} has no run identity`);
  }
  const root = value["root"];
  const valid =
    typeof value["runId"] === "string" &&
    value["runId"] !== "" &&
    typeof value["checkout"] === "string" &&
    typeof root === "string" &&
    isAbsolute(root) &&
    typeof value["sha"] === "string" &&
    typeof value["ref"] === "string";
  if (!valid) {
    throw new Error(`${path} has no run identity`);
  }
  assertGitIdentity(value, path);
  if (resolve(root) !== resolve(dirname(path), "../../../..")) {
    throw new Error(`${path} disagrees with identity.root`);
  }
  if (basename(dirname(path)) !== value["runId"]) {
    throw new Error(`${path} disagrees with identity.runId`);
  }
  const newFields = [value["indexPath"], value["slotPath"], value["checkouts"]];
  if (newFields.some((field) => field !== undefined)) {
    const checkouts = value["checkouts"];
    const primary = isRecord(checkouts) ? checkoutLocation(checkouts["primary"]) : null;
    const subject = isRecord(checkouts) ? checkoutLocation(checkouts["subject"]) : null;
    if (
      value["indexPath"] !== path ||
      value["slotPath"] !== dirname(path) ||
      primary === null ||
      subject === null ||
      !(subject.kind === "primary" || subject.kind === "linked" || subject.kind === "unknown") ||
      resolve(subject.path) !== resolve(root)
    ) {
      throw new Error(`${path} has malformed absolute index/slot/checkout identity`);
    }
  }
}

function assertProcess(value: unknown, path: string): asserts value is SnapRunIndex["process"] {
  if (!isRecord(value)) {
    throw new Error(`${path} has no process provenance`);
  }
  const startedAt = value["startedAt"];
  const finishedAt = value["finishedAt"];
  const valid =
    typeof value["host"] === "string" &&
    typeof value["pid"] === "number" &&
    Array.isArray(value["argv"]) &&
    typeof startedAt === "string" &&
    typeof finishedAt === "string" &&
    Number.isFinite(Date.parse(startedAt)) &&
    Number.isFinite(Date.parse(finishedAt)) &&
    Date.parse(finishedAt) >= Date.parse(startedAt) &&
    isStringOrNull(value["lane"]) &&
    isStringOrNull(value["agent"]);
  if (!valid) {
    throw new Error(`${path} has no process provenance`);
  }
}

function validBinding(value: unknown): boolean {
  return value === null || (isRecord(value) && ["base", "file", "stage"].includes(String(value["kind"])) && typeof value["url"] === "string");
}

function validTypedStage(stage: unknown): boolean {
  return (
    isRecord(stage) &&
    STAGE_KINDS.has(String(stage["mode"])) &&
    ["bound", "not-applicable", "unavailable"].includes(String(stage["state"])) &&
    isStringOrNull(stage["ownerCheckout"]) &&
    (stage["band"] === null || (Number.isInteger(stage["band"]) && Number(stage["band"]) >= 0)) &&
    isStringOrNull(stage["ref"]) &&
    validBinding(stage["binding"]) &&
    isStringOrNull(stage["failure"])
  );
}

function assertProvenance(value: unknown, path: string): asserts value is SnapRunIndex["provenance"] {
  if (!(isRecord(value) && Array.isArray(value["concurrency"]) && isStringOrNull(value["session"]))) {
    throw new Error(`${path} has no session/stage/concurrency provenance`);
  }
  const stage = value["stage"];
  if (!(STAGE_KINDS.has(String(stage)) || validTypedStage(stage))) {
    throw new Error(`${path} has malformed stage provenance`);
  }
  for (const field of ["sessionCall", "evidenceWindow"] as const) {
    const member = value[field];
    if (!(member === undefined || member === null || (Number.isInteger(member) && Number(member) >= 0))) {
      throw new Error(`${path} has malformed session ${field}`);
    }
  }
  const binding = value["sessionBinding"];
  if (binding !== undefined && !validBinding(binding)) {
    throw new Error(`${path} has malformed session binding`);
  }
}

function assertVerdict(value: unknown, path: string): asserts value is SnapRunIndex["verdict"] {
  if (!isRecord(value) || typeof value["exit"] !== "number" || !VERDICT_STATES.has(String(value["state"])) || !Array.isArray(value["arms"])) {
    throw new Error(`${path} has no terminal verdict`);
  }
  const malformed = value["arms"].some(
    (arm) =>
      !isRecord(arm) ||
      typeof arm["arm"] !== "string" ||
      !Object.hasOwn(ARM_DEFS, arm["arm"]) ||
      typeof arm["source"] !== "string" ||
      typeof arm["lifetime"] !== "string" ||
      !ARM_STATES.has(String(arm["state"])) ||
      !Array.isArray(arm["artifacts"]),
  );
  if (malformed) {
    throw new Error(`${path} has malformed arm verdict evidence`);
  }
}

function assertDiagnostics(value: unknown, path: string): asserts value is SnapRunIndex["diagnostics"] {
  if (!isRecord(value)) {
    throw new Error(`${path} has malformed diagnostic evidence`);
  }
  const records = value["records"];
  const valid =
    value["source"] === "orb-console-ring" &&
    value["channel"] === "browser-diagnostics" &&
    DIAGNOSTIC_STATES.has(String(value["state"])) &&
    Array.isArray(value["reads"]) &&
    Array.isArray(value["recordArtifacts"]) &&
    isRecord(records) &&
    typeof records["total"] === "number" &&
    typeof records["limitEvents"] === "number" &&
    typeof records["complete"] === "boolean";
  if (!valid) {
    throw new Error(`${path} has malformed diagnostic evidence`);
  }
  const counts = value["counts"];
  const rawChannels = value["rawChannels"];
  if (
    !(
      (counts === undefined ||
        (Array.isArray(counts) &&
          counts.every(
            (row) =>
              isRecord(row) &&
              typeof row["channel"] === "string" &&
              typeof row["source"] === "string" &&
              isStringOrNull(row["category"]) &&
              DIAGNOSTIC_LEVELS.some((level) => level === row["level"]) &&
              Number.isInteger(row["context"]) &&
              Number.isInteger(row["page"]) &&
              evidenceWindowIdSchema.safeParse(row["window"]).success &&
              Number.isInteger(row["records"]),
          ))) &&
      (rawChannels === undefined ||
        (Array.isArray(rawChannels) &&
          rawChannels.every(
            (row) =>
              isRecord(row) &&
              typeof row["channel"] === "string" &&
              typeof row["artifact"] === "string" &&
              instrumentEvidenceScopeSchema.safeParse(row["scope"]).success &&
              (row["records"] === null || Number.isInteger(row["records"])) &&
              Number.isInteger(row["limitEvents"]) &&
              typeof row["complete"] === "boolean",
          )))
    )
  ) {
    throw new Error(`${path} has malformed diagnostic count/channel inventory`);
  }
}

function assertFindings(value: unknown, path: string): asserts value is SnapRunIndex["findings"] {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${path} has malformed composite findings`);
  }
  for (const finding of value) {
    const valid =
      isRecord(finding) &&
      FINDING_SEVERITIES.has(String(finding["severity"])) &&
      FINDING_COMPLETENESS.has(String(finding["completeness"])) &&
      Array.isArray(finding["arms"]) &&
      finding["arms"].every((member) => typeof member === "string" && Object.hasOwn(ARM_DEFS, member)) &&
      Array.isArray(finding["channels"]) &&
      finding["channels"].every((member) => typeof member === "string") &&
      typeof finding["what"] === "string" &&
      typeof finding["where"] === "string" &&
      Array.isArray(finding["evidence"]) &&
      finding["evidence"].length > 0 &&
      finding["evidence"].every(
        (evidence) =>
          isRecord(evidence) &&
          typeof evidence["source"] === "string" &&
          typeof evidence["artifact"] === "string" &&
          instrumentEvidenceScopeSchema.safeParse(evidence["scope"]).success,
      ) &&
      ["direct", "correlated"].includes(String(finding["confidence"])) &&
      Array.isArray(finding["conflicts"]) &&
      finding["conflicts"].every((member) => typeof member === "string") &&
      Number.isInteger(finding["occurrences"]) &&
      Number(finding["occurrences"]) > 0 &&
      typeof finding["next"] === "string" &&
      finding["next"].startsWith(`pnpm snap --report ${path} --problems`);
    if (!valid) {
      throw new Error(`${path} has malformed composite findings`);
    }
  }
}

function assertIndex(value: unknown, path: string): asserts value is SnapRunIndex {
  if (!isRecord(value) || value["v"] !== 1) {
    throw new Error(`${path} is not a Snap run-index v1`);
  }
  assertIdentity(value["identity"], path);
  assertProcess(value["process"], path);
  assertProvenance(value["provenance"], path);
  assertVerdict(value["verdict"], path);
  assertDiagnostics(value["diagnostics"], path);
  if (!(Array.isArray(value["resultPairs"]) && value["resultPairs"].length > 0 && value["resultPairs"].every(isStringPair))) {
    throw new Error(`${path} has malformed RESULT evidence`);
  }
  assertFindings(value["findings"], path);
  if (!Array.isArray(value["artifacts"])) {
    throw new Error(`${path} has no artifact inventory`);
  }
}

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
    // @orb-gate-ignore caught-failure-ownership(empty:catch): a neighbouring run's corruption is not this report's verdict — the subject index is read by the strict door in printSnapReport, and a skipped neighbour only means no delta row. Ends if this reader becomes the only read of those files.
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
  // @orb-gate-ignore caught-failure-ownership(empty:error): this is the browser-free reader's terminal owner; it prints RUN INDEX REFUSED and returns tool-error for every resolution/validation/artifact failure. Ends if either output or exit vote disappears.
  try {
    const path = await resolveSnapRunIndex(root, query.target);
    const index = await readSnapRunIndex(path);
    await renderSnapRunReport(index, path, query);
    const previous = await previousRunWithSameName(root, index);
    if (previous !== null) {
      renderSnapRunDelta(previous, runRegressions(index, previous), path);
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
      // @orb-gate-ignore caught-failure-ownership(empty:error): list mode retains path+reason in `invalid` and `printSnapReports` emits the bounded aggregate; the strict single-index reader remains the detailed refusal door. Ends if either retention or aggregate output disappears.
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
