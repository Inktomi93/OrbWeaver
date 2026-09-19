// Snap's immutable run-index writer. It runs while the slot is still owned, after every terminal exit.
import { writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import type { InstrumentRunCompletion } from "../../_shared/artifact-out.ts";
import { artifactRef, exactScopeIdentity, factBatchId, notApplicableScope, scopeMatches } from "../../_shared/artifact-scope.ts";
import { checkoutName } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { SnapRunFactBatch, SnapRunResults } from "../contract/run-facts.ts";
import { parseSnapRunResults, SNAP_RUN_RESULTS_VERSION, snapDiagnosticRetention, snapExitCode } from "../contract/run-facts.ts";
import type { SnapRunArtifact, SnapRunIndex, SnapStageProvenance } from "../contract/run-index.ts";
import type { SessionRunProvenance } from "../contract/session.ts";
import type { Args } from "../contract/types.ts";
import { classifySnapArtifactCompleteness } from "../lib/run-bundle-artifacts.ts";
import type { DiagnosticArtifactSource } from "../lib/run-bundle-diagnostics.ts";
import {
  countBy,
  countLevels,
  diagnosticCounts,
  rawDiagnosticChannels,
  readSnapDiagnosticArtifact as readSnapDiagnosticArtifactLeaf,
  writeCompletenessArtifact,
  writeSnapDiagnosticEvidence as writeSnapDiagnosticEvidenceLeaf,
} from "../lib/run-bundle-diagnostics.ts";
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

// The front door keeps the public surface its callers already import; the diagnostic-evidence writer and
// its schema-guarded reader live in the `lib/` leaf so this file stays the run-index writer alone.
export const readSnapDiagnosticArtifact = readSnapDiagnosticArtifactLeaf;
export const writeSnapDiagnosticEvidence = writeSnapDiagnosticEvidenceLeaf;

export const registerSnapDiagnosticCompleteness = registerSnapDiagnosticCompletenessState;
export const registerSnapFactBatch = registerSnapFactBatchState;
export const registerSnapResultPairs = registerSnapResultPairsState;
export const registerSnapSessionProvenance = registerSnapSessionProvenanceState;
export const takeSnapFactBatches = takeSnapFactBatchesState;
export const takeSnapResultPairs = takeSnapResultPairsState;

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
