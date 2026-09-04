// Concise terminal end-card for the immutable Snap run index.
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { snapDiagnosticRetention } from "../contract/run-facts.ts";
import type { SnapRunIndex } from "../contract/run-index.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const ARTIFACT_DISPLAY_CAP = 6;
const FINDING_DISPLAY_CAP = 5;
const IDENTITY_PREFIX_LENGTH = 12;

function playwrightTrace(artifact: SnapRunIndex["artifacts"][number]): boolean {
  return artifact.schema === "playwright-trace" && artifact.channel === "playwright-trace" && artifact.path.endsWith(".zip");
}

function printRawFallback(artifact: SnapRunIndex["artifacts"][number]): void {
  print(`RAW FALLBACK ${artifact.path} (human/deep forensics; not primary evidence)`);
  if (playwrightTrace(artifact)) {
    print(`VIEW       pnpm exec playwright show-trace ${artifact.path}`);
    return;
  }
  print(`FORENSICS  open the raw ${artifact.channel ?? artifact.schema ?? "artifact"} at ${artifact.path}`);
}

function printFindingReceipt(index: SnapRunIndex): void {
  const findings = index.findings ?? [];
  for (const finding of findings.slice(0, FINDING_DISPLAY_CAP)) {
    const evidence = finding.evidence.map((row) => `${row.source}@${row.artifact}`).join(",");
    const conflicts = finding.conflicts.length === 0 ? "none" : finding.conflicts.join("; ");
    print(
      `FINDING    ${finding.severity} | ${finding.what.replace(/\s+/gu, " ")} | ${finding.where.replace(/\s+/gu, " ")} | evidence=${evidence} confidence=${finding.confidence} completeness=${finding.completeness} conflicts=${JSON.stringify(conflicts)} occurrences=${String(finding.occurrences)} | next=${finding.next}`,
    );
  }
  if (findings.length > FINDING_DISPLAY_CAP) {
    print(`FINDINGS   omitted=${String(findings.length - FINDING_DISPLAY_CAP)} of ${String(findings.length)}; full population in run.json and READ below`);
  }
}

function stageReceipt(stage: SnapRunIndex["provenance"]["stage"]): string {
  if (typeof stage === "string") {
    return `${stage}:legacy`;
  }
  const binding = stage.binding === null ? "none" : `${stage.binding.kind}:${stage.binding.url}`;
  return `${stage.mode}:${stage.state}:owner=${stage.ownerCheckout ?? "none"}:band=${String(stage.band ?? "none")}:ref=${stage.ref ?? "none"}:binding=${binding}${
    stage.failure === null ? "" : `:failure=${JSON.stringify(stage.failure)}`
  }`;
}

export function printRunReceipt(index: SnapRunIndex, path: string): void {
  const counts = index.verdict.arms.reduce<Record<string, number>>((acc, arm) => {
    acc[arm.state] = (acc[arm.state] ?? 0) + 1;
    return acc;
  }, {});
  const completenessDropped = index.diagnostics.totals === null ? 0 : index.diagnostics.totals.dropped;
  const dropped = completenessDropped + snapDiagnosticRetention(index.results).dropped;
  print("");
  print(
    `RUN        ${index.identity.runId} checkout=${index.identity.checkout} sha=${index.identity.sha.slice(0, IDENTITY_PREFIX_LENGTH)} lane=${index.process.lane ?? "none"}`,
  );
  printFindingReceipt(index);
  print(
    `PROVENANCE session=${index.provenance.session ?? "none"} call=${String(index.provenance.sessionCall ?? "none")} window=${String(index.provenance.evidenceWindow ?? "none")} binding=${index.provenance.sessionBinding === null || index.provenance.sessionBinding === undefined ? "none" : `${index.provenance.sessionBinding.kind}:${index.provenance.sessionBinding.url}`} stage=${stageReceipt(index.provenance.stage)} concurrency=${index.provenance.concurrency.join(",") || "none"}`,
  );
  print(`EVIDENCE   ${path}`);
  print(
    "RETAINED   this run slot is kept for at least 24h; after that the newest 10 per instrument survive and the rest are listed by `pnpm snap --reports` as PRUNED",
  );
  print(
    `VERDICT    exit=${index.verdict.exit} diagnostics=${index.diagnostics.records.total} dropped=${String(dropped)} diagnostics-state=${index.diagnostics.state} disk-complete=${index.diagnostics.records.complete ? "yes" : "no"} ${Object.entries(
      counts,
    )
      .map(([state, count]) => `${state}=${count}`)
      .join(" ")}`,
  );
  const primary = index.artifacts.filter((artifact) => artifact.role === "primary");
  for (const artifact of primary.slice(0, ARTIFACT_DISPLAY_CAP)) {
    print(`ARTIFACT   ${artifact.path}`);
  }
  if (primary.length > ARTIFACT_DISPLAY_CAP) {
    print(`ARTIFACTS  omitted=${primary.length - ARTIFACT_DISPLAY_CAP} primary (full inventory in run.json)`);
  }
  for (const artifact of index.artifacts.filter((candidate) => candidate.role === "raw-fallback")) {
    printRawFallback(artifact);
  }
  print(`READ       pnpm snap --report ${path} --problems`);
  print(`RESULT snap exit=${index.verdict.exit} index=${path}`);
}
