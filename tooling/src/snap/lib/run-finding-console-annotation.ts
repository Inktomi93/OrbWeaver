// The typed console-annotation parser (#1372), moved out of run-finding-browser.ts to hold the 450-line
// cap: the app's fixed console-line grammar and the finding drafts it produces from browser diagnostics.
import { exactScope } from "../../_shared/artifact-scope.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DiskSafeBrowserDiagnostic } from "../contract/browser-evidence-redaction.ts";
import type { SnapFindingDisposition, SnapRunArtifact, SnapRunIndex } from "../contract/run-index.ts";
import { isDevToolsFrontendProtocolNoise } from "./devtools-frontend-noise.ts";
import type { FindingDraft } from "./run-finding-common.ts";
import { findingLocation, findingRef, findingSymptom } from "./run-finding-common.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

interface DiagnosticAttribution {
  readonly arm: "motion" | "interaction-perf" | "react-profile" | "dead-css";
  readonly tag: string;
}

function diagnosticAttribution(row: DiskSafeBrowserDiagnostic): DiagnosticAttribution | null {
  // Only the CSS-formatted console line emitted by the client logger is instrumentation. The duplicate
  // orb-console ring and ordinary prose can contain the same bracketed words without owning this grammar.
  const tag =
    row.source === "console-api"
      ? /^%c\d{2}:\d{2}:\d{2}\.\d{3} \[(perf|frame|input|reflow|cls|anim|css|drop|space)\]%c(?:\s|$)/u.exec(row.text)?.[1]
      : undefined;
  if (tag === undefined) {
    return null;
  }
  if (tag === "perf") {
    return { arm: "react-profile", tag };
  }
  if (tag === "input") {
    return { arm: "interaction-perf", tag };
  }
  if (tag === "css") {
    return { arm: "dead-css", tag };
  }
  return { arm: "motion", tag };
}

/** The app's instrumentation console line, TYPED (#1372).
 *
 *  The client logger prints one fixed shape — `%c<time> [tag]%c <body> <css…>` — and snap was carrying the
 *  whole thing, CSS colour arguments included, as a finding's `what`. That is ~250 bytes per row of
 *  terminal escape configuration, and it made five annotation rows 5.3 KB of a 17 KB `--map` run. The raw
 *  text is still the diagnostics artifact's (nothing is lost); what a FINDING row prints is the reading.
 *
 *  Bounded parse, never a guess: the CSS argument tail is dropped, the metric is the phrase before the
 *  first measured number, and `value`/`budget`/`subject` are emitted ONLY when the line actually carries
 *  them. A line that does not fit falls back to its own body, which is still shorter than the raw text. */
export interface DiagnosticAnnotation {
  readonly tag: string;
  readonly metric: string;
  readonly value: string | null;
  readonly budget: string | null;
  readonly subject: string | null;
}

const ANNOTATION_LINE = /^%c\d{2}:\d{2}:\d{2}\.\d{3} \[([a-z]+)\]%c\s+(.*)$/su;
/** Trailing `color:#c60;font-weight:bold color:#888` — the `%c` arguments, never content. */
const CSS_ARGUMENTS = /(?:\s(?:color|font-weight|background|font-style):[^\s]+)+\s*$/gu;
const MEASURED_VALUE = /(\d+(?:\.\d+)?)(ms\b)?/u;
const BUDGET = /budget (\d+(?:\.\d+)?)(ms)?/u;
/** A segment that names WHERE: a selector, a element, a region/route label, or a script attribution. */
const SUBJECT_SEGMENT = /^(?:[[<.#]|region:|route |@ |[a-z]+\[)/u;

export function annotationOf(text: string): DiagnosticAnnotation | null {
  const match = ANNOTATION_LINE.exec(text);
  const tag = match?.[1];
  const rest = match?.[2];
  if (tag === undefined || rest === undefined) {
    return null;
  }
  const body = rest.replace(CSS_ARGUMENTS, "").replace(/\s+/gu, " ").trim();
  const segments = body.split(" · ");
  const head = segments[0] ?? body;
  const measured = MEASURED_VALUE.exec(head);
  const budget = BUDGET.exec(body);
  const subject = segments.slice(1).find((segment) => SUBJECT_SEGMENT.test(segment)) ?? null;
  return {
    tag,
    metric: (measured === null ? head : head.slice(0, measured.index)).trim() || head,
    value: measured === null ? null : `${measured[1]}${measured[2] ?? ""}`,
    budget: budget === null ? null : `${budget[1]}${budget[2] ?? "ms"}`,
    subject,
  };
}

/** The row's `what`, in the order a reader triages: what broke, by how much, against what, where. */
export function annotationText(annotation: DiagnosticAnnotation): string {
  const parts = [`${annotation.tag} ${annotation.metric}`];
  if (annotation.value !== null) {
    parts.push(`value=${annotation.value}`);
  }
  if (annotation.budget !== null) {
    parts.push(`budget=${annotation.budget}`);
  }
  if (annotation.subject !== null) {
    parts.push(`subject=${annotation.subject}`);
  }
  return parts.join(" ");
}

function diagnosticCorrelation(row: DiskSafeBrowserDiagnostic): string {
  if (/net::[A-Z_]+/u.test(row.text)) {
    return `symptom:${findingSymptom(row.text)}`;
  }
  if (row.requestId !== null) {
    return `request:${row.requestId}`;
  }
  if (row.issueCode !== null) {
    return `issue:${row.issueCode}`;
  }
  return `symptom:${findingSymptom(row.text)}`;
}

/** WHICH RESULT COUNTER, IF ANY, THIS DIAGNOSTIC ENTERED (#1385 item 4).
 *
 *  A dogfood run printed `FINDING error | ResizeObserver loop …` beside `RESULT console-errors=0` and
 *  exited 0, and nothing on the row said whether the reader should file it. That pairing is not a
 *  contradiction: `console-errors` counts PAGE-CONSOLE errors (ops/noise.ts's `verdictConsoleErrors`) and
 *  `page-errors` counts uncaught exceptions, while the diagnostics ring ALSO carries browser-log lines,
 *  CDP audit issues, the app's own console ring and the instrument's own limit receipts — none of which
 *  any counter counts. `origin` is the fact that decides it, so the row states it rather than implying it.
 *
 *  An ANNOTATION row (the app's instrumentation grammar) is never a verdict input either; it is attributed
 *  to an arm for reading, and that arm's own budget — not this line — is what votes. */
function diagnosticDisposition(row: DiskSafeBrowserDiagnostic, attribution: DiagnosticAttribution | null): SnapFindingDisposition {
  if (attribution !== null) {
    return { counted: false, reason: `${attribution.arm}-annotation` };
  }
  if (row.origin === "page-console") {
    if (row.level !== "error") {
      return { counted: false, reason: "console-warning" };
    }
    // …EXCEPT where the verdict itself fenced the line out. `console-errors` is `verdictConsoleErrors`,
    // which subtracts the named harness-induced classes, so a row this reader calls `counted` while that
    // counter ignores it IS the contradiction this header warns about — printed on every `--matrix` cell by
    // the vendored frontend's Autofill pair until #2431. The class's one recognizer decides both.
    return isDevToolsFrontendProtocolNoise(row.text, row.location?.url)
      ? { counted: false, reason: "devtools-frontend-noise" }
      : { counted: true, reason: "console-errors" };
  }
  if (row.origin === "page-error") {
    return { counted: true, reason: "page-errors" };
  }
  return { counted: false, reason: row.origin };
}

function diagnosticSeverity(row: DiskSafeBrowserDiagnostic, attribution: DiagnosticAttribution | null): FindingDraft["severity"] {
  if (attribution !== null) {
    return "annotation";
  }
  return row.level === "error" ? "error" : "warning";
}

export function diagnosticFindingDrafts(
  diagnosticsState: SnapRunIndex["diagnostics"]["state"],
  diagnostics: readonly DiskSafeBrowserDiagnostic[],
  artifacts: readonly SnapRunArtifact[],
  indexPath: string,
): FindingDraft[] {
  const artifact = artifacts.find((candidate) => candidate.producer === "browser-diagnostics")?.path ?? indexPath;
  return diagnostics
    .filter((row) => row.level === "error" || row.level === "warning")
    .map((row) => {
      const attribution = diagnosticAttribution(row);
      const annotation = attribution === null ? null : annotationOf(row.text);
      return {
        severity: diagnosticSeverity(row, attribution),
        arms: attribution === null ? [] : [attribution.arm],
        channels: [attribution === null ? "browser-diagnostics" : "orb-attribution"],
        what: annotation === null ? row.text : annotationText(annotation),
        where: findingLocation(row.contextIndex, row.pageIndex, String(row.evidenceWindow)),
        evidence: [findingRef(row.source, artifact, exactScope(row.contextIndex, row.pageIndex, row.evidenceWindow))],
        completeness: diagnosticsState === "complete" ? "bounded" : "incomplete",
        conflicts: [],
        occurrences: 1,
        disposition: diagnosticDisposition(row, attribution),
        correlation: attribution === null ? diagnosticCorrelation(row) : `attribution:${attribution.arm}:${attribution.tag}`,
      };
    });
}
