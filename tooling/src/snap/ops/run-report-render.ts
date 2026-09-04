// Terminal rendering for an already-validated immutable run index. Resolution and validation stay in
// run-report.ts so this module cannot turn a malformed file into a display-only success.

import { scopeLabel, scopeMatches } from "../../_shared/artifact-scope.ts";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { snapDiagnosticRetention } from "../contract/run-facts.ts";
import type { SnapReportQuery, SnapRunIndex } from "../contract/run-index.ts";
import { readReactProfileSummary } from "../lib/react-profile-receipt.ts";
import { reportAnalyzerProblems } from "../lib/run-report-analyzers.ts";
import { artifactMatches, diagnosticMatches, findingMatches } from "../lib/run-report-query.ts";
import { readSnapDiagnosticArtifact } from "./run-bundle.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

const DIAGNOSTIC_DISPLAY_CAP = 20;
const FINDING_DISPLAY_CAP = 20;
const INVALID_INDEX_EXAMPLE_CAP = 3;
const RUN_LIST_DISPLAY_CAP = 20;
const IDENTITY_PREFIX_LENGTH = 12;
const FACT_DATA_DISPLAY_CAP = 800;
const REACT_HOT_DISPLAY_CAP = 5;
const REACT_DURATION_DECIMALS = 3;

function playwrightTrace(artifact: SnapRunIndex["artifacts"][number]): boolean {
  return artifact.schema === "playwright-trace" && artifact.channel === "playwright-trace" && artifact.path.endsWith(".zip");
}

export interface SnapRunIndexScan {
  readonly rows: readonly SnapRunIndex[];
  readonly invalid: readonly { readonly path: string; readonly reason: string }[];
  readonly scanned: number;
}

function explicitDiagnosticFilter(query: SnapReportQuery): boolean {
  return query.channel === "browser-diagnostics" || query.level !== null || query.source !== null || query.category !== null || query.text !== null;
}

async function reportDiagnostics(index: SnapRunIndex, path: string, query: SnapReportQuery): Promise<void> {
  const completenessDropped = index.diagnostics.totals === null ? 0 : index.diagnostics.totals.dropped;
  const dropped = completenessDropped + snapDiagnosticRetention(index.results).dropped;
  print(
    `DIAGNOSTICS  state=${index.diagnostics.state} records=${String(index.diagnostics.records.total)} dropped=${String(dropped)} limit-events=${String(index.diagnostics.records.limitEvents)} artifacts=${String(index.diagnostics.recordArtifacts.length)}`,
  );
  if (query.arm !== null && query.mode !== "all" && !explicitDiagnosticFilter(query)) {
    print(
      `DIAGNOSTICS  unrelated-to-arm=${query.arm} rows=${String(index.diagnostics.records.total)}; inspect pnpm snap --report ${path} --problems --channel browser-diagnostics`,
    );
    return;
  }
  const rows = (await Promise.all(index.diagnostics.recordArtifacts.map(readSnapDiagnosticArtifact)))
    .flatMap((artifact) => artifact.records)
    .filter((row) => diagnosticMatches(row, query));
  const severity = { error: 0, warning: 1, info: 2, verbose: 3 } as const;
  const selected = rows.toSorted((left, right) => severity[left.level] - severity[right.level]).slice(0, DIAGNOSTIC_DISPLAY_CAP);
  for (const row of selected) {
    print(
      `DIAGNOSTIC   [${row.level}] ${row.source}/${row.category ?? "uncategorized"} c${String(row.contextIndex)}p${String(row.pageIndex)}w${String(row.evidenceWindow)} ${row.text}`,
    );
  }
  if (rows.length > DIAGNOSTIC_DISPLAY_CAP) {
    print(`DIAGNOSTICS  omitted=${String(rows.length - DIAGNOSTIC_DISPLAY_CAP)} highest-severity rows shown; narrow with --level/--source/--category/--text`);
  }
}

function reportArtifact(artifact: SnapRunIndex["artifacts"][number]): void {
  const label = artifact.role === "raw-fallback" ? "RAW FALLBACK" : "ARTIFACT    ";
  const identity = scopeLabel(artifact.scope);
  const limits = (artifact.limits ?? []).reduce((sum, receipt) => sum + receipt.events.length, 0);
  const detail = artifact.completenessDetail === undefined ? "" : ` detail=${JSON.stringify(artifact.completenessDetail)}`;
  const published = artifact.publishedPath === undefined || artifact.publishedPath === null ? "" : ` published=${artifact.publishedPath}`;
  print(
    `${label} ${artifact.path} bytes=${artifact.bytes} producer=${artifact.producer} arm=${artifact.producerArm ?? "none"} channel=${artifact.channel ?? "legacy"} media=${artifact.mediaType ?? artifact.schema ?? "unknown"} schema=${artifact.schema ?? "none"} identity=${identity} completeness=${artifact.completeness} limit-events=${String(limits)}${detail}${published}`,
  );
  if (artifact.role === "raw-fallback" && playwrightTrace(artifact)) {
    print(`VIEW         pnpm exec playwright show-trace ${artifact.path}`);
  } else if (artifact.role === "raw-fallback") {
    print(`FORENSICS    open the raw ${artifact.channel ?? artifact.schema ?? "artifact"} at ${artifact.path}`);
  }
}

function factArtifactRefs(index: SnapRunIndex, query: SnapReportQuery): ReadonlySet<string> {
  if (query.arm === null) {
    return new Set();
  }
  return new Set(
    index.results?.batches
      .flatMap((batch) => batch.arms)
      .filter((fact) => fact.arm === query.arm && scopeMatches(fact.scope, query))
      .flatMap((fact) => fact.artifacts) ?? [],
  );
}

function reportArtifacts(index: SnapRunIndex, query: SnapReportQuery): void {
  const linked = factArtifactRefs(index, query);
  for (const artifact of index.artifacts.filter((candidate) => artifactMatches(candidate, query) || linked.has(candidate.relativePath))) {
    reportArtifact(artifact);
  }
}

function factData(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length <= FACT_DATA_DISPLAY_CAP ? text : `${text.slice(0, FACT_DATA_DISPLAY_CAP)}… (full typed data in run.json)`;
}

function reportFacts(index: SnapRunIndex, query: SnapReportQuery): void {
  if (index.results === undefined) {
    print("FACTS        legacy-v1 index has no typed results; RESULT pairs remain transcript-only");
    return;
  }
  for (const batch of index.results.batches) {
    if (query.arm === null) {
      for (const fact of batch.core.filter((candidate) => scopeMatches(candidate.scope, query))) {
        print(`FACT         batch=${batch.id} core=${fact.schema} scope=${scopeLabel(fact.scope)} data=${factData(fact.data)}`);
      }
    }
    for (const fact of batch.arms.filter((candidate) => (query.arm === null || candidate.arm === query.arm) && scopeMatches(candidate.scope, query))) {
      print(
        `FACT         batch=${batch.id} arm=${fact.arm} schema=${fact.schema} state=${fact.data.state} scope=${scopeLabel(fact.scope)} data=${factData(fact.data)}`,
      );
    }
  }
}

async function reportReactProfileSummary(index: SnapRunIndex, query: SnapReportQuery): Promise<void> {
  if (query.arm !== "react-profile") {
    return;
  }
  const artifacts = index.artifacts.filter((artifact) => artifact.schema === "snap-react-profile-summary-v1" && artifactMatches(artifact, query));
  for (const artifact of artifacts) {
    const summary = await readReactProfileSummary(artifact.path);
    print(
      `REACT       renderers=${String(summary.summary.rendererCount)} commits=${String(summary.summary.commitCount)} components=${String(summary.summary.componentCount)} shown=${String(Math.min(summary.hottest.length, REACT_HOT_DISPLAY_CAP))} summary=${artifact.path}`,
    );
    for (const row of summary.hottest.slice(0, REACT_HOT_DISPLAY_CAP)) {
      print(
        `REACT HOT   ${row.totalActualDurationMs.toFixed(REACT_DURATION_DECIMALS)}ms total ${row.averageActualDurationMs.toFixed(REACT_DURATION_DECIMALS)}ms avg ${row.selfTimeMs.toFixed(REACT_DURATION_DECIMALS)}ms self c${String(row.contextIndex)}p${String(row.pageIndex)} ${row.path}`,
      );
    }
    print(`REACT FILES summary=${artifact.path} raw-fiber=${summary.artifacts.rawFiber} trace=${summary.artifacts.trace}`);
  }
}

function reportIdentity(index: SnapRunIndex, query: SnapReportQuery): void {
  print(`RUN REPORT   ${index.identity.runId} checkout=${index.identity.checkout} sha=${index.identity.sha} lane=${index.process.lane ?? "none"}`);
  if (query.mode !== "all") {
    return;
  }
  const source = index.identity.dirty.state === "dirty" ? "working-tree" : index.identity.dirty.state;
  const failures = index.identity.gitFailures ?? [];
  print(
    `SOURCE       source=${source} digest=${index.identity.dirty.digest ?? "unavailable"}${failures.length === 0 ? "" : ` git-failures=${JSON.stringify(failures)}`}`,
  );
}

function stageReceipt(index: SnapRunIndex): string {
  const stage = index.provenance.stage;
  if (typeof stage === "string") {
    return `${stage}:legacy`;
  }
  const binding = stage.binding === null ? "none" : `${stage.binding.kind}:${stage.binding.url}`;
  return `${stage.mode}:${stage.state}:owner=${stage.ownerCheckout ?? "none"}:band=${String(stage.band ?? "none")}:ref=${stage.ref ?? "none"}:binding=${binding}${
    stage.failure === null ? "" : `:failure=${JSON.stringify(stage.failure)}`
  }`;
}

function reportFindings(index: SnapRunIndex, query: SnapReportQuery): void {
  const rows = (index.findings ?? []).filter((finding) => findingMatches(finding, query));
  for (const finding of rows.slice(0, FINDING_DISPLAY_CAP)) {
    const evidence = finding.evidence.map((row) => `${row.source}@${row.artifact}`).join(",");
    const conflicts = finding.conflicts.length === 0 ? "none" : finding.conflicts.join("; ");
    print(
      `FINDING      ${finding.severity} | ${finding.what.replace(/\s+/gu, " ")} | ${finding.where.replace(/\s+/gu, " ")} | evidence=${evidence} confidence=${finding.confidence} completeness=${finding.completeness} conflicts=${JSON.stringify(conflicts)} occurrences=${String(finding.occurrences)} | next=${finding.next}`,
    );
  }
  if (rows.length > FINDING_DISPLAY_CAP) {
    print(
      `FINDINGS     omitted=${String(rows.length - FINDING_DISPLAY_CAP)} of ${String(rows.length)} indexed rows; narrow with --arm/--channel/--source/--context/--page/--window/--text`,
    );
  }
}

export async function renderSnapRunReport(index: SnapRunIndex, path: string, query: SnapReportQuery): Promise<void> {
  reportIdentity(index, query);
  print(
    `PROVENANCE   session=${index.provenance.session ?? "none"} call=${String(index.provenance.sessionCall ?? "none")} window=${String(index.provenance.evidenceWindow ?? "none")} binding=${index.provenance.sessionBinding === null || index.provenance.sessionBinding === undefined ? "none" : `${index.provenance.sessionBinding.kind}:${index.provenance.sessionBinding.url}`} stage=${stageReceipt(index)} concurrency=${index.provenance.concurrency.join(",") || "none"}`,
  );
  print(`VERDICT      ${index.verdict.state} exit=${index.verdict.exit}`);
  reportFacts(index, query);
  await reportReactProfileSummary(index, query);
  reportFindings(index, query);
  const arms = index.verdict.arms.filter(
    (row) => (query.arm === null || row.arm === query.arm) && (query.arm !== null || query.mode === "all" || !["passed", "off"].includes(row.state)),
  );
  for (const arm of arms) {
    print(`ARM          ${arm.arm} state=${arm.state} source=${arm.source} lifetime=${arm.lifetime}${arm.detail === null ? "" : ` detail=${arm.detail}`}`);
  }
  // Current indices already persist analyzer problems as severity-ranked findings. Default problem
  // reports show that one display population; --all remains the explicit raw analyzer-row view.
  await reportAnalyzerProblems(index, query, query.mode === "all" || index.findings === undefined);
  await reportDiagnostics(index, path, query);
  reportArtifacts(index, query);
  print(`INDEX        ${path}`);
}

export function renderSnapRunList(scan: SnapRunIndexScan): void {
  for (const row of scan.rows.slice(0, RUN_LIST_DISPLAY_CAP)) {
    print(
      `RUN ${row.identity.runId} checkout=${row.identity.checkout} sha=${row.identity.sha.slice(0, IDENTITY_PREFIX_LENGTH)} lane=${row.process.lane ?? "none"} verdict=${row.verdict.state} time=${row.process.finishedAt}`,
    );
  }
  if (scan.rows.length > RUN_LIST_DISPLAY_CAP) {
    print(
      `RUNS OMITTED valid=${String(scan.rows.length - RUN_LIST_DISPLAY_CAP)} total=${String(scan.rows.length)} showing-newest=${String(RUN_LIST_DISPLAY_CAP)}; inspect a known run with pnpm snap --report <exact-run-id> --problems`,
    );
  }
  if (scan.invalid.length > 0) {
    const examples = scan.invalid.slice(0, INVALID_INDEX_EXAMPLE_CAP);
    print(
      `RUN INDEX SKIPPED invalid=${String(scan.invalid.length)} scanned=${String(scan.scanned)} examples=${String(examples.length)} omitted=${String(scan.invalid.length - examples.length)} paths=${JSON.stringify(examples)} inspect with pnpm snap --report <absolute-run.json> --all; remove a stale run directory only after review`,
    );
  }
}
