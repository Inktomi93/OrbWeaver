// Snap's immutable run-index writer. It runs while the slot is still owned, after every terminal exit.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { artifactFilePath, artifactKey } from "../../_shared/artifact-naming.ts";
import type { InstrumentRunCompletion } from "../../_shared/artifact-out.ts";
import { artifactDir, registerInstrumentArtifact } from "../../_shared/artifact-out.ts";
import {
  aggregateScope,
  artifactRef,
  evidenceWindowId,
  exactScope,
  exactScopeIdentity,
  factBatchId,
  notApplicableScope,
  scopeMatches,
} from "../../_shared/artifact-scope.ts";
import { checkoutName } from "../../_shared/artifacts.ts";
import { DIAGNOSTIC_LEVELS, DIAGNOSTIC_ORIGINS } from "../../_shared/browser-contract.ts";
import type { BrowserDiagnostic, OrbConsoleCompletenessSummary } from "../../_shared/browser-diagnostics.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { DiskSafeBrowserDiagnostic, DiskSafeLimitReceipt } from "../contract/browser-evidence-redaction.ts";
import { NETWORK_LIMIT_KINDS } from "../contract/har-redaction.ts";
import type { SnapRunFactBatch, SnapRunResults } from "../contract/run-facts.ts";
import { parseSnapRunResults, SNAP_RUN_RESULTS_VERSION, snapDiagnosticRetention, snapExitCode } from "../contract/run-facts.ts";
import type { SnapRunArtifact, SnapRunDiagnosticCompleteness, SnapRunIndex, SnapStageProvenance } from "../contract/run-index.ts";
import type { SessionRunProvenance } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import { redactBrowserDiagnostics } from "../lib/browser-evidence-redaction.ts";
import { classifySnapArtifactCompleteness } from "../lib/run-bundle-artifacts.ts";
import { collectSnapRunArtifacts, readSnapRunStartedAt, snapCheckoutIdentity, snapDirtyIdentity, snapGitIdentity } from "../lib/run-bundle-files.ts";
import {
  ambientRunOwner,
  diagnosticState,
  registerSnapDiagnosticCompleteness as registerSnapDiagnosticCompletenessState,
  registerSnapFactBatch as registerSnapFactBatchState,
  registerSnapResultPairs as registerSnapResultPairsState,
  registerSnapSessionProvenance as registerSnapSessionProvenanceState,
  takeDiagnosticCompleteness,
  takeSessionProvenance,
  takeSnapFactBatches as takeSnapFactBatchesState,
  takeSnapResultPairs as takeSnapResultPairsState,
} from "../lib/run-bundle-state.ts";
import { snapArmVerdicts, snapRunStateFromExit, terminalSnapResultPairs } from "../lib/run-bundle-verdict.ts";
import { collectSnapFindings } from "../lib/run-findings.ts";
import { takeSnapStageProvenance } from "../lib/run-provenance.ts";
import { printRunReceipt } from "./run-bundle-receipt.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const RUN_INDEX = "run.json";
const DIAGNOSTIC_COMPLETENESS = join("evidence", "orb-console-completeness.json");
const DIAGNOSTIC_ARTIFACT_VERSION = 1;

export const registerSnapDiagnosticCompleteness = registerSnapDiagnosticCompletenessState;
export const registerSnapFactBatch = registerSnapFactBatchState;
export const registerSnapResultPairs = registerSnapResultPairsState;
export const registerSnapSessionProvenance = registerSnapSessionProvenanceState;
export const takeSnapFactBatches = takeSnapFactBatchesState;
export const takeSnapResultPairs = takeSnapResultPairsState;

interface SnapDiagnosticArtifact {
  readonly v: typeof DIAGNOSTIC_ARTIFACT_VERSION;
  readonly records: readonly DiskSafeBrowserDiagnostic[];
  readonly _orbMeasuredLimit: DiskSafeLimitReceipt;
}

/** A run slot holds as many diagnostic captures as the run performed, so the artifact is named after the
 *  CAPTURE, and an already-taken name takes the next ordinal. Both halves are load-bearing (#2419): the
 *  writer used to ignore its name argument and file one slot-global `diagnostics.json`, which every
 *  `--matrix` cell after v01 hit as EEXIST — and the session daemon keys a call by its ROUTE, so two calls
 *  to one route legitimately repeat the name. `wx` is KEPT rather than widened to `w`: an overwrite would
 *  silently destroy the earlier capture's evidence, which is the worse half of the same defect. */
const DIAGNOSTIC_CAPTURE_LIMIT = 500;

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, "code") === "EEXIST";
}

/** The daemon and one-shot host both call this inside the active/adopted slot, once per capture. The
 *  client-side indexer later reads this exact typed artifact; it never scrapes a manifest or terminal
 *  prose, and it reads the whole FAMILY (`producer === "browser-diagnostics"`), never a fixed filename. */
export async function writeSnapDiagnosticEvidence(name: string, records: readonly BrowserDiagnostic[]): Promise<string> {
  const safe = redactBrowserDiagnostics(records);
  const limitEvents = safe._orbMeasuredLimit.events.length + safe.records.reduce((sum, record) => sum + record._orbMeasuredLimit.events.length, 0);
  const artifact: SnapDiagnosticArtifact = { v: DIAGNOSTIC_ARTIFACT_VERSION, records: safe.records, _orbMeasuredLimit: safe._orbMeasuredLimit };
  const body = `${JSON.stringify(artifact, null, 2)}\n`;
  const dir = await artifactDir("browser-diagnostics");
  const base = artifactKey(name);
  for (let ordinal = 1; ordinal <= DIAGNOSTIC_CAPTURE_LIMIT; ordinal += 1) {
    const path = artifactFilePath(dir, ordinal === 1 ? base : `${base}-${String(ordinal)}`, ".json");
    try {
      await writeFile(path, body, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (isFileExistsError(error)) {
        continue;
      }
      throw error;
    }
    // Registered only AFTER the bytes land: a path this call lost the race for belongs to another capture,
    // and declaring it here would attribute that capture's evidence to this one.
    await registerInstrumentArtifact("browser-diagnostics", path, {
      producer: "browser-diagnostics",
      producerArm: null,
      channel: "browser-diagnostics",
      mediaType: "application/json",
      schema: `snap-browser-diagnostics-v${String(DIAGNOSTIC_ARTIFACT_VERSION)}`,
      role: "primary",
      completeness: limitEvents === 0 ? "complete" : "bounded",
      completenessDetail:
        limitEvents === 0 ? "complete redacted diagnostic batch" : "bounded redacted diagnostic batch with structured measured-limit receipts",
      scope: aggregateScope(),
      records: safe.records.length,
      limits: [
        {
          source: "browser-diagnostics-redaction",
          complete: limitEvents === 0,
          policy: { ...safe._orbMeasuredLimit.policy },
          events: [safe._orbMeasuredLimit, ...safe.records.map((record) => record._orbMeasuredLimit)].flatMap((receipt) => receipt.events),
        },
      ],
    });
    return path;
  }
  throw new Error(
    `INSTRUMENT ERROR: ${String(DIAGNOSTIC_CAPTURE_LIMIT)} diagnostic captures are already filed under "${base}" in this run slot — refusing to keep counting rather than overwrite one.`,
  );
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function nullableNonnegativeInteger(value: unknown): value is number | null {
  return value === null || nonnegativeInteger(value);
}

function isLimitReceipt(value: unknown): value is DiskSafeLimitReceipt {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const policy = Reflect.get(value, "policy");
  const events = Reflect.get(value, "events");
  const validPolicy =
    typeof policy === "object" &&
    policy !== null &&
    ["maxDepth", "maxFields", "maxStringBytes", "maxBodyBytes", "maxEntries", "maxUrlBytes"].every((field) => nonnegativeInteger(Reflect.get(policy, field)));
  return (
    validPolicy &&
    Array.isArray(events) &&
    events.every(
      (event) =>
        typeof event === "object" &&
        event !== null &&
        NETWORK_LIMIT_KINDS.some((kind) => kind === Reflect.get(event, "kind")) &&
        typeof Reflect.get(event, "path") === "string" &&
        nullableNonnegativeInteger(Reflect.get(event, "original")) &&
        nullableNonnegativeInteger(Reflect.get(event, "retained")) &&
        nullableNonnegativeInteger(Reflect.get(event, "omitted")),
    )
  );
}

function isDiagnosticRecord(value: unknown): value is DiskSafeBrowserDiagnostic {
  return (
    typeof value === "object" &&
    value !== null &&
    DIAGNOSTIC_ORIGINS.some((origin) => origin === Reflect.get(value, "origin")) &&
    typeof Reflect.get(value, "source") === "string" &&
    DIAGNOSTIC_LEVELS.some((level) => level === Reflect.get(value, "level")) &&
    typeof Reflect.get(value, "text") === "string" &&
    typeof Reflect.get(value, "timestamp") === "number" &&
    Number.isFinite(Reflect.get(value, "timestamp")) &&
    Number(Reflect.get(value, "timestamp")) >= 0 &&
    nonnegativeInteger(Reflect.get(value, "contextIndex")) &&
    nonnegativeInteger(Reflect.get(value, "pageIndex")) &&
    nonnegativeInteger(Reflect.get(value, "evidenceWindow")) &&
    isLimitReceipt(Reflect.get(value, "_orbMeasuredLimit"))
  );
}

export interface DiagnosticArtifactRead {
  readonly records: readonly DiskSafeBrowserDiagnostic[];
  readonly limitEvents: number;
}

export async function readSnapDiagnosticArtifact(path: string): Promise<DiagnosticArtifactRead> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is a corrupt browser-diagnostics artifact (${error instanceof Error ? error.message : String(error)})`, { cause: error });
  }
  const records =
    typeof parsed === "object" && parsed !== null && Reflect.get(parsed, "v") === DIAGNOSTIC_ARTIFACT_VERSION ? Reflect.get(parsed, "records") : null;
  const batchLimit = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "_orbMeasuredLimit") : null;
  if (!(Array.isArray(records) && records.every(isDiagnosticRecord) && isLimitReceipt(batchLimit))) {
    throw new Error(`${path} is not browser-diagnostics artifact v${String(DIAGNOSTIC_ARTIFACT_VERSION)}`);
  }
  const safeRecords = records;
  return {
    records: safeRecords,
    limitEvents: batchLimit.events.length + safeRecords.reduce((sum, record) => sum + record._orbMeasuredLimit.events.length, 0),
  };
}

function countBy(records: readonly BrowserDiagnostic[], field: "level" | "source" | "category"): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const value = record[field] ?? "uncategorized";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function countLevels(records: readonly BrowserDiagnostic[]): SnapRunIndex["diagnostics"]["records"]["levels"] {
  const counts: Partial<Record<BrowserDiagnostic["level"], number>> = {};
  for (const record of records) {
    counts[record.level] = (counts[record.level] ?? 0) + 1;
  }
  return counts;
}

async function writeCompletenessArtifact(slotDir: string, summary: OrbConsoleCompletenessSummary | null): Promise<string | null> {
  if (summary === null) {
    return null;
  }
  const path = join(slotDir, DIAGNOSTIC_COMPLETENESS);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await registerInstrumentArtifact("evidence", path, {
    producer: "snap",
    producerArm: null,
    channel: "diagnostic-completeness",
    mediaType: "application/json",
    schema: "orb-console-completeness-v1",
    role: "primary",
    completeness: "complete",
    completenessDetail: "complete typed diagnostic completeness summary",
    scope: notApplicableScope("run-global diagnostic completeness receipt"),
    records: summary.reads.length,
    limits: [],
  });
  return path;
}

function diagnosticChannel(record: BrowserDiagnostic): string {
  if (record.origin === "page-console") {
    return "console";
  }
  if (record.origin === "page-error") {
    return "page-errors";
  }
  if (record.origin === "browser-log") {
    return "cdp-log";
  }
  if (record.origin === "audits") {
    return "inspector-issue";
  }
  return record.origin;
}

function diagnosticCounts(records: readonly BrowserDiagnostic[]): NonNullable<SnapRunDiagnosticCompleteness["counts"]> {
  const counts = new Map<string, NonNullable<SnapRunDiagnosticCompleteness["counts"]>[number]>();
  for (const record of records) {
    const channel = diagnosticChannel(record);
    const window = evidenceWindowId(record.evidenceWindow);
    const key = JSON.stringify([channel, record.source, record.category, record.level, record.contextIndex, record.pageIndex, window]);
    const prior = counts.get(key);
    counts.set(key, {
      channel,
      source: record.source,
      category: record.category,
      level: record.level,
      context: record.contextIndex,
      page: record.pageIndex,
      window,
      records: (prior?.records ?? 0) + 1,
    });
  }
  return [...counts.values()].sort((left, right) =>
    [left.context, left.page, left.window, left.channel, left.source, left.category ?? "", left.level]
      .join("\u0000")
      .localeCompare([right.context, right.page, right.window, right.channel, right.source, right.category ?? "", right.level].join("\u0000")),
  );
}

/** One capture's diagnostic artifact, paired with what was read back out of it. A run has as many as it
 *  had captures (#2419), and each one's rows must name ITS OWN path — crediting every record to the first
 *  file would send a reader chasing cell v02's warning inside cell v01's evidence. */
interface DiagnosticArtifactSource {
  readonly path: string;
  readonly read: DiagnosticArtifactRead;
}

function rawDiagnosticChannels(
  artifacts: readonly SnapRunArtifact[],
  sources: readonly DiagnosticArtifactSource[],
): NonNullable<SnapRunDiagnosticCompleteness["rawChannels"]> {
  const rows = sources.flatMap((source) =>
    diagnosticCounts(source.read.records).map((count) => ({
      channel: count.channel,
      artifact: source.path,
      scope: exactScope(count.context, count.page, count.window),
      records: count.records,
      limitEvents: source.read.limitEvents,
      complete: source.read.limitEvents === 0,
    })),
  );
  const externalChannels = artifacts.flatMap((artifact) => {
    const channel = artifact.channel;
    return channel === "requests" || channel === "har"
      ? [
          {
            channel,
            artifact: artifact.path,
            scope: artifact.scope,
            records: artifact.records ?? null,
            limitEvents: (artifact.limits ?? []).reduce((sum, receipt) => sum + receipt.events.length, 0),
            complete: artifact.completeness === "complete",
          },
        ]
      : [];
  });
  return [...rows, ...externalChannels];
}

function sessionStageProvenance(provenance: SessionRunProvenance | null, fallback: SnapStageProvenance): SnapStageProvenance {
  if (provenance === null) {
    return fallback;
  }
  const stage = provenance.stage;
  if (stage === undefined) {
    return {
      mode: "session",
      state: "unavailable",
      ownerCheckout: null,
      band: null,
      ref: null,
      binding: provenance.binding,
      failure: "session provenance predates the exact stage receipt",
    };
  }
  return { mode: "session", ...stage };
}
function artifactSupportsArmFact(artifact: SnapRunArtifact, fact: SnapRunFactBatch["arms"][number]): boolean {
  if (artifact.producerArm === fact.arm) {
    return true;
  }
  // ARIA and map are structured inside the run-wide capture manifest. Giving that file to `shot`
  // misattributes its producer; linking the shared manifest from these facts preserves both truths.
  return artifact.channel === "capture-manifest" && (fact.arm === "aria" || fact.arm === "map");
}
function artifactScopeSupportsFact(artifact: SnapRunArtifact, fact: SnapRunFactBatch["arms"][number]): boolean {
  if (fact.scope.context.kind !== "exact" || fact.scope.page.kind !== "exact" || fact.scope.window.kind !== "exact") {
    const scope = artifact.scope;
    return scope.kind === "scope-v1" && [scope.context, scope.page, scope.window].every((dimension) => dimension.kind === "aggregate");
  }
  return scopeMatches(artifact.scope, exactScopeIdentity(fact.scope));
}
/** Write exactly once while the slot is still owned. A second writer is corruption, not an update. */
export async function completeSnapRun(completion: InstrumentRunCompletion, opts: Args, argv: readonly string[]): Promise<string> {
  const finishedAt = new Date().toISOString();
  const diagnosticSummary = takeDiagnosticCompleteness();
  const diagnosticArtifact = await writeCompletenessArtifact(completion.slot.dir, diagnosticSummary);
  const exit = completion.exit ?? EXIT.toolError;
  const resultPairs = terminalSnapResultPairs(takeSnapResultPairsState(), exit, completion.error);
  const sessionProvenance = takeSessionProvenance();
  const stageProvenance = sessionStageProvenance(sessionProvenance, takeSnapStageProvenance(opts));
  const inventoried = await collectSnapRunArtifacts(completion.slot.dir);
  const diagnosticRecordArtifacts = inventoried.filter((artifact) => artifact.producer === "browser-diagnostics");
  const diagnosticSources: readonly DiagnosticArtifactSource[] = await Promise.all(
    diagnosticRecordArtifacts.map(async (artifact) => ({ path: artifact.path, read: await readSnapDiagnosticArtifact(artifact.path) })),
  );
  const diagnosticRecords = diagnosticSources.flatMap((source) => source.read.records);
  const diagnosticLimitEvents = diagnosticSources.reduce((sum, source) => sum + source.read.limitEvents, 0);
  const artifacts = inventoried.map(classifySnapArtifactCompleteness);
  const registeredBatches = takeSnapFactBatchesState();
  const fallbackBatch: SnapRunFactBatch = {
    id: factBatchId("terminal"),
    core: [
      {
        kind: "core",
        schema: "snap-terminal-v1",
        source: "instrument-run-owner",
        lifetime: "run completion",
        scope: notApplicableScope("terminal-only run fact"),
        artifacts: [],
        data: {
          exit: snapExitCode(exit),
          state: snapRunStateFromExit(exit),
          detail: completion.error === null ? "run completed without a browser fact batch" : "run threw before browser facts completed",
        },
      },
    ],
    arms: [],
  };
  const results: SnapRunResults = parseSnapRunResults({
    v: SNAP_RUN_RESULTS_VERSION,
    batches: (registeredBatches.length === 0 ? [fallbackBatch] : registeredBatches).map((batch) => ({
      ...batch,
      arms: batch.arms.map((fact) => ({
        ...fact,
        artifacts: artifacts
          .filter((candidate) => artifactSupportsArmFact(candidate, fact) && artifactScopeSupportsFact(candidate, fact))
          .map((candidate) => artifactRef(candidate.relativePath)),
      })),
    })),
  });
  const retainedDiagnostics = snapDiagnosticRetention(results);
  const owner = ambientRunOwner();
  const gitIdentity = snapGitIdentity(completion.root);
  const dirtyIdentity = snapDirtyIdentity(completion.root);
  const checkoutIdentity = snapCheckoutIdentity(completion.root);
  const path = join(completion.slot.dir, RUN_INDEX);
  const verdict: SnapRunIndex["verdict"] = {
    exit,
    state: snapRunStateFromExit(exit),
    arms: snapArmVerdicts(opts, results, artifacts),
  };
  const findings = await collectSnapFindings({
    indexPath: path,
    verdict,
    artifacts,
    diagnosticsState: diagnosticState(diagnosticSummary, diagnosticLimitEvents, diagnosticRecordArtifacts.length, retainedDiagnostics.complete),
    diagnostics: diagnosticRecords,
  });
  const index: SnapRunIndex = {
    v: 1,
    identity: {
      runId: completion.slot.runId,
      checkout: checkoutName(completion.root),
      root: resolve(completion.root),
      indexPath: path,
      slotPath: resolve(completion.slot.dir),
      checkouts: checkoutIdentity.checkouts,
      sha: gitIdentity.sha,
      ref: gitIdentity.ref,
      dirty: { state: dirtyIdentity.state, digest: dirtyIdentity.digest },
      gitFailures: [...gitIdentity.failures, ...dirtyIdentity.failures, ...checkoutIdentity.failures],
    },
    process: {
      host: hostname(),
      pid: process.pid,
      argv: [...argv],
      startedAt: await readSnapRunStartedAt(completion.slot.dir),
      finishedAt,
      lane: owner.lane,
      agent: owner.agent,
    },
    provenance: {
      session: sessionProvenance === null ? (opts.session ?? opts.sessionExport) : sessionProvenance.name,
      sessionCall: sessionProvenance === null ? null : sessionProvenance.call,
      evidenceWindow: sessionProvenance === null ? null : sessionProvenance.evidenceWindow,
      sessionBinding: sessionProvenance === null ? null : sessionProvenance.binding,
      stage: stageProvenance,
      concurrency: completion.slot.racing,
    },
    verdict,
    resultPairs,
    results,
    diagnostics: {
      source: "orb-console-ring",
      channel: "browser-diagnostics",
      state: diagnosticState(diagnosticSummary, diagnosticLimitEvents, diagnosticRecordArtifacts.length, retainedDiagnostics.complete),
      artifact: diagnosticArtifact,
      reads: diagnosticSummary?.reads ?? [],
      totals: diagnosticSummary === null ? null : diagnosticSummary.totals,
      recordArtifacts: diagnosticRecordArtifacts.map((artifact) => artifact.path),
      records: {
        total: diagnosticRecords.length,
        levels: countLevels(diagnosticRecords),
        sources: countBy(diagnosticRecords, "source"),
        categories: countBy(diagnosticRecords, "category"),
        limitEvents: diagnosticLimitEvents,
        complete: diagnosticLimitEvents === 0,
      },
      counts: diagnosticCounts(diagnosticRecords),
      rawChannels: rawDiagnosticChannels(artifacts, diagnosticSources),
    },
    artifacts,
    findings,
  };
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  printRunReceipt(index, path);
  return path;
}
