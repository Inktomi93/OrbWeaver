// Concise terminal end-card for the immutable Snap run index.
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { snapDiagnosticRetention } from "../contract/run-facts.ts";
import type { SnapCompositeFinding, SnapFindingDisposition, SnapRunIndex } from "../contract/run-index.ts";
import { findingDispositionDisplay, findingEvidenceDisplay, findingNextDisplay } from "../lib/run-finding-display.ts";

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

/** The arms whose SUBJECT is the app's own instrumentation. If none of them was asked for, the
 *  `[perf]`/`[frame]`/`[cls]` rows are not this run's evidence — they are ambient. */
const ANNOTATION_ARMS = new Set(["motion", "interaction-perf", "react-profile", "cpu-profile", "boot-trace"]);

function measuringArmRequested(index: SnapRunIndex): boolean {
  return index.verdict.arms.some((arm) => ANNOTATION_ARMS.has(arm.arm) && arm.state !== "off");
}

/** The worst measured value across a set of annotation rows, as the row printed it. Ordering by the
 *  NUMBER (not the string) so `9ms` never reads as worse than `192ms`. */
function worstAnnotation(rows: readonly SnapCompositeFinding[]): string {
  let worst: { readonly text: string; readonly value: number } | null = null;
  for (const row of rows) {
    const measured = /value=(\d+(?:\.\d+)?)(\S*)/u.exec(row.what);
    const value = Number(measured?.[1] ?? Number.NaN);
    if (Number.isFinite(value) && (worst === null || value > worst.value)) {
      worst = { text: `${measured?.[1] ?? ""}${measured?.[2] ?? ""}`, value };
    }
  }
  return worst?.text ?? "unstated";
}

/** The channel an ATTRIBUTED console annotation carries (`lib/run-finding-console-annotation.ts`). Its
 *  `what` is composed as `<tag> <metric> value=…`, so for those rows — and ONLY those — the first word IS
 *  the tag. */
const CONSOLE_ANNOTATION_CHANNEL = "orb-attribution";

/** The collapse used to take the first word of EVERY annotation's text as its tag, which is a tag only for
 *  the console rows above. #1616's run-global load-suspect annotation reads "the app-snapshot arm MEASURED
 *  on a loaded box …", so on any contended box the receipt printed `annotations  the=1 perf=1` — a key
 *  named "the", in the one line whose job is to say what the annotations ARE. A non-console row is named by
 *  its DISPOSITION REASON (`load-suspect`), which is the thing it actually is. */
function annotationTag(row: SnapCompositeFinding): string {
  if (row.channels.includes(CONSOLE_ANNOTATION_CHANNEL)) {
    return row.what.split(" ")[0] ?? "other";
  }
  // ANNOTATED, and the annotation is load-bearing twice over: `disposition` is optional on the READ side
  // (an immutable index written before that field landed carries none), and without the explicit type
  // biome's own inference calls the undefined arm unnecessary while tsc calls its absence an error.
  const disposition: SnapFindingDisposition | undefined = row.disposition;
  const reason = disposition === undefined ? "" : disposition.reason;
  return reason === "" ? "other" : reason;
}

/** ONE line for every ambient annotation (#1372) — counts by tag, the worst value, and the reader that
 *  expands them. They stay in run.json in full; what changes is whether an unasked-for measurement gets
 *  to outweigh the evidence the argv actually requested. */
function printAnnotationCollapse(rows: readonly SnapCompositeFinding[], index: SnapRunIndex): void {
  if (rows.length === 0) {
    return;
  }
  const byTag = new Map<string, number>();
  for (const row of rows) {
    byTag.set(annotationTag(row), (byTag.get(annotationTag(row)) ?? 0) + row.occurrences);
  }
  const counts = [...byTag].map(([tag, count]) => `${tag}=${String(count)}`).join(" ");
  const arm = rows.flatMap((row) => row.arms)[0] ?? "motion";
  print(`annotations  ${counts} worst=${worstAnnotation(rows)} → pnpm snap --report ${index.identity.runId} --problems --arm ${arm}`);
}

function printFindingReceipt(index: SnapRunIndex, path: string): void {
  const all = index.findings ?? [];
  const collapse = !measuringArmRequested(index);
  const findings = collapse ? all.filter((row) => row.severity !== "annotation") : all;
  for (const finding of findings.slice(0, FINDING_DISPLAY_CAP)) {
    // #1369 — cite the run by the id the RUN line above just printed, not by its absolute index path
    // twice per row. `run.json` keeps the absolute form.
    const evidence = findingEvidenceDisplay(finding, path);
    const conflicts = finding.conflicts.length === 0 ? "none" : finding.conflicts.join("; ");
    print(
      `FINDING    ${finding.severity} | ${finding.what.replace(/\s+/gu, " ")} | ${finding.where.replace(/\s+/gu, " ")} | evidence=${evidence} confidence=${finding.confidence} completeness=${finding.completeness} disposition=${findingDispositionDisplay(finding)} conflicts=${JSON.stringify(conflicts)} occurrences=${String(finding.occurrences)} | next=${findingNextDisplay(finding, index, path)}`,
    );
  }
  if (findings.length > FINDING_DISPLAY_CAP) {
    print(`FINDINGS   omitted=${String(findings.length - FINDING_DISPLAY_CAP)} of ${String(findings.length)}; full population in run.json and READ below`);
  }
  if (collapse) {
    printAnnotationCollapse(
      all.filter((row) => row.severity === "annotation"),
      index,
    );
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
  printFindingReceipt(index, path);
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
