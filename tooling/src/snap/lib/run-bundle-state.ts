import type { ResultPair } from "../../_shared/artifacts.ts";
import type { OrbConsoleCompletenessSummary } from "../../_shared/browser-diagnostics.ts";
import { summarizeOrbConsoleCompleteness } from "../../_shared/browser-diagnostics.ts";
import { inheritedProcessEnv } from "../../_shared/process-env.ts";
import type { SnapRunFactBatch } from "../contract/run-facts.ts";
import { parseSnapRunResults, SNAP_RUN_RESULTS_VERSION } from "../contract/run-facts.ts";
import type { SnapRunIndex } from "../contract/run-index.ts";
import type { SessionRunProvenance } from "../contract/session.ts";

let diagnosticSummaries: OrbConsoleCompletenessSummary[] = [];
let terminalResultPairs: (readonly [string, string])[] = [];
let terminalFactBatches: SnapRunFactBatch[] = [];
let terminalSessionProvenance: SessionRunProvenance | null = null;

export function registerSnapDiagnosticCompleteness(summary: OrbConsoleCompletenessSummary): void {
  diagnosticSummaries.push(summary);
}

export function registerSnapResultPairs(pairs: readonly ResultPair[] | readonly (readonly [string, string])[]): void {
  terminalResultPairs = pairs.map(([key, value]) => [String(key), String(value)] as const);
}

export function registerSnapFactBatch(batch: SnapRunFactBatch): void {
  const parsed = parseSnapRunResults({ v: SNAP_RUN_RESULTS_VERSION, batches: [batch] });
  terminalFactBatches.push(...parsed.batches);
}

export function registerSnapSessionProvenance(provenance: SessionRunProvenance): void {
  terminalSessionProvenance = provenance;
}

export function takeSnapResultPairs(): readonly (readonly [string, string])[] {
  const pairs = terminalResultPairs;
  terminalResultPairs = [];
  return pairs;
}

export function takeSnapFactBatches(): readonly SnapRunFactBatch[] {
  const batches = terminalFactBatches;
  terminalFactBatches = [];
  return batches;
}

export function takeSessionProvenance(): SessionRunProvenance | null {
  const provenance = terminalSessionProvenance;
  terminalSessionProvenance = null;
  return provenance;
}

function takeDiagnosticSummaries(): readonly OrbConsoleCompletenessSummary[] {
  const summaries = diagnosticSummaries;
  diagnosticSummaries = [];
  return summaries;
}

export function ambientRunOwner(): { readonly lane: string | null; readonly agent: string | null } {
  const environment = inheritedProcessEnv();
  return { lane: environment["ORB_RUN_LANE"] ?? null, agent: environment["ORB_RUN_AGENT"] ?? null };
}

export function takeDiagnosticCompleteness(): OrbConsoleCompletenessSummary | null {
  const rows = takeDiagnosticSummaries().flatMap((summary) => summary.reads);
  return rows.length === 0 ? null : summarizeOrbConsoleCompleteness(rows);
}

export function diagnosticState(
  summary: OrbConsoleCompletenessSummary | null,
  limitEvents: number,
  artifactCount: number,
  retentionComplete: boolean,
): SnapRunIndex["diagnostics"]["state"] {
  if (summary === null) {
    return artifactCount === 0 ? "absent" : "incomplete";
  }
  return summary.totals.complete && limitEvents === 0 && retentionComplete ? "complete" : "incomplete";
}
