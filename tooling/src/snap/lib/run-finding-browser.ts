// Browser-channel readers for diagnostics, the redacted core capture, and HAR evidence.

import { aggregateDimension, exactDimension, exactScope, pageIndex, scopeV1 } from "../../_shared/artifact-scope.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DriveFailure } from "../contract/actions.ts";
import type { DiskSafeBrowserDiagnostic } from "../contract/browser-evidence-redaction.ts";
import type { SnapFindingEvidenceRef, SnapRunArtifact, SnapRunIndex } from "../contract/run-index.ts";
import type { FindingDraft } from "./run-finding-common.ts";
import { findingCompleteness, findingIdentity, findingLocation, findingRef, findingSymptom, malformedFinding, readJson, record } from "./run-finding-common.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

const HTTP_ERROR_MIN = 400;

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
        correlation: attribution === null ? diagnosticCorrelation(row) : `attribution:${attribution.arm}:${attribution.tag}`,
      };
    });
}

function matchingIdentity(diagnostics: readonly FindingDraft[], value: string): SnapFindingEvidenceRef | null {
  const key = `symptom:${findingSymptom(value)}`;
  return diagnostics.find((row) => row.correlation === key)?.evidence[0] ?? null;
}

function requestFailure(value: Readonly<Record<string, unknown>>): string | null {
  if (typeof value["failed"] === "string" && value["failed"] !== "") {
    return value["failed"];
  }
  const status = value["status"];
  return typeof status === "number" && status >= HTTP_ERROR_MIN ? `HTTP ${String(status)}` : null;
}

interface CoreCaptureRows {
  readonly pageErrors: readonly unknown[];
  readonly failedRequests: readonly unknown[];
  readonly captures: readonly unknown[];
}

const CORE_POPULATIONS = {
  pageErrors: { dropped: 0, complete: true, basis: "all-observed" },
  failedRequests: { dropped: null, complete: false, basis: "latest-per-url" },
  captures: { dropped: 0, complete: true, basis: "all-pages" },
} as const;

function assertPopulationReceipt(
  path: string,
  populations: Readonly<Record<string, unknown>> | null,
  name: keyof CoreCaptureRows,
  rows: readonly unknown[],
): void {
  const receipt = record(populations?.[name]);
  const expected = CORE_POPULATIONS[name];
  if (
    receipt?.["records"] !== rows.length ||
    receipt["dropped"] !== expected.dropped ||
    receipt["complete"] !== expected.complete ||
    receipt["basis"] !== expected.basis
  ) {
    throw new Error(`${path} has a missing or inconsistent ${name} completeness receipt`);
  }
}

function parseCoreRows(path: string, parsed: Readonly<Record<string, unknown>> | null): CoreCaptureRows {
  if (parsed?.["v"] !== 1) {
    throw new Error(`${path} is not core capture evidence v1`);
  }
  const pageErrors = parsed["pageErrors"];
  const failedRequests = parsed["failedRequests"];
  const captures = parsed["captures"];
  if (!(Array.isArray(pageErrors) && Array.isArray(failedRequests) && Array.isArray(captures))) {
    throw new Error(`${path} has malformed core capture populations`);
  }
  const rows = { pageErrors, failedRequests, captures };
  const populations = record(parsed["populations"]);
  for (const name of ["pageErrors", "failedRequests", "captures"] as const) {
    assertPopulationReceipt(path, populations, name, rows[name]);
  }
  return rows;
}

function corePageErrorDrafts(path: string, rows: readonly unknown[], diagnostics: readonly FindingDraft[]): FindingDraft[] {
  return rows.map((value) => {
    const error = record(value);
    const kind = error?.["kind"];
    const name = error?.["name"];
    const message = error?.["message"];
    const stack = error?.["stack"];
    if (
      (kind !== "runtime" && kind !== "instrument") ||
      !(name === null || typeof name === "string") ||
      typeof message !== "string" ||
      !(stack === null || typeof stack === "string")
    ) {
      throw new Error(`${path} has a malformed page-error row`);
    }
    const text = kind === "instrument" ? `INSTRUMENT ERROR: ${message}` : `${name ?? "Error"}: ${message}`;
    const identity = matchingIdentity(diagnostics, text);
    const exact = identity === null ? null : findingIdentity(identity);
    return {
      severity: "error",
      arms: [],
      channels: ["page-errors"],
      what: text,
      where: exact === null ? "run" : findingLocation(exact.context, exact.page, exact.window),
      evidence: [findingRef("core-capture", path, identity?.scope)],
      completeness: "complete",
      conflicts: [],
      occurrences: 1,
      correlation: `symptom:${findingSymptom(text)}`,
    };
  });
}

function coreRequestDrafts(path: string, rows: readonly unknown[], diagnostics: readonly FindingDraft[]): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  for (const value of rows) {
    const request = record(value);
    if (request === null) {
      throw new Error(`${path} has a malformed request row`);
    }
    const failure = requestFailure(request);
    if (failure === null) {
      continue;
    }
    const identity = matchingIdentity(diagnostics, failure);
    drafts.push({
      severity: "error",
      arms: ["requests"],
      channels: ["requests"],
      what: failure,
      where: `${String(request["method"] ?? "request")} ${String(request["url"] ?? "(unknown URL)")}`,
      evidence: [findingRef("core-capture", path, identity?.scope)],
      completeness: "bounded",
      conflicts: [],
      occurrences: 1,
      correlation: `symptom:${findingSymptom(failure)}`,
    });
  }
  return drafts;
}

/** THE VERB. A wait that never matched is not the same defect as a click that hit a detached node, and a
 *  nav that was rejected is neither — the reader's next move differs for each. */
function driveFailureVerb(failure: DriveFailure): string {
  if (failure.kind === "nav") {
    return "did not land";
  }
  return failure.flag === "--wait" || failure.flag === "--wait-for" ? "never matched" : "failed";
}

/** WHAT a failed drive action says, in the operator's own argv (#1344). */
function driveFailureText(failure: DriveFailure): string {
  const position = failure.index < 0 ? failure.flag : `${failure.kind === "nav" ? "nav" : "step"} ${String(failure.index)} ${failure.flag}`;
  const target = failure.subject === null ? "" : ` ${JSON.stringify(failure.subject)}`;
  return `${position}${target} ${driveFailureVerb(failure)} (${failure.reason})`;
}

/** One persisted row, validated. Strict on purpose: a shape drift here would otherwise print a finding
 *  about `undefined`, and the whole point of the row is that it names the argv to correct. */
function parseDriveFailure(path: string, value: unknown): DriveFailure {
  const failure = record(value);
  const index = failure?.["index"];
  const kind = failure?.["kind"];
  const flag = failure?.["flag"];
  const subject = failure?.["subject"] ?? null;
  const reason = failure?.["reason"];
  const valid =
    Number.isInteger(index) &&
    (kind === "step" || kind === "nav" || kind === "wait") &&
    typeof flag === "string" &&
    (subject === null || typeof subject === "string") &&
    typeof reason === "string";
  if (!valid) {
    throw new Error(`${path} has a malformed drive-failure row`);
  }
  return { index: Number(index), kind, flag: String(flag), subject: subject as string | null, reason: String(reason) };
}

function driveFailureRows(path: string, capture: Readonly<Record<string, unknown>> | null): readonly DriveFailure[] {
  const failures = capture?.["driveFailures"];
  if (failures === undefined) {
    // An index written before the row shipped legitimately has no population here. That is different from
    // a run that HAD failures and dropped them: `stepFailures`/`navFailures` stay on the same capture row,
    // so the disagreement stays visible rather than silent.
    return [];
  }
  if (!Array.isArray(failures)) {
    throw new Error(`${path} has a malformed driveFailures population`);
  }
  return failures.map((entry) => parseDriveFailure(path, entry));
}

/** One FINDING row per failed nav/step/wait, read back from the redacted core capture.
 *
 *  These are `error` rows on purpose: a failed action invalidates EVERY capture taken after it, so it
 *  outranks the `[perf]`/`[cls]` console annotations that used to be the only rows on the end card of a
 *  run whose `--wait-for` selector was simply wrong (2026-09-04 dogfood — two extra calls to find that
 *  out). */
function coreDriveFailureDrafts(artifact: SnapRunArtifact, rows: readonly unknown[]): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  for (const value of rows) {
    const capture = record(value);
    const page = typeof capture?.["pageIndex"] === "number" ? capture["pageIndex"] : null;
    const scope =
      page === null ? artifact.scope : scopeV1({ context: aggregateDimension(), page: exactDimension(pageIndex(page)), window: aggregateDimension() });
    for (const failure of driveFailureRows(artifact.path, capture)) {
      drafts.push({
        severity: "error",
        arms: [],
        channels: ["drive"],
        what: driveFailureText(failure),
        where: findingLocation(null, page, null),
        evidence: [findingRef("core-capture", artifact.path, scope)],
        completeness: "complete",
        conflicts: ["every capture taken after this action describes a surface the drive never reached"],
        occurrences: 1,
        correlation: `drive:${String(page)}:${String(failure.index)}:${failure.flag}`,
      });
    }
  }
  return drafts;
}

function coreMapDrafts(artifact: SnapRunArtifact, rows: readonly unknown[]): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  for (const value of rows) {
    const capture = record(value);
    const page = typeof capture?.["pageIndex"] === "number" ? capture["pageIndex"] : null;
    for (const [field, subject] of [
      ["mapAtlasError", "SPA nav atlas"],
      ["mapShellError", "shell topology"],
      ["mapError", "surface map"],
    ] as const) {
      const message = capture?.[field];
      if (typeof message !== "string" || message === "") {
        continue;
      }
      drafts.push({
        severity: "error",
        arms: ["map"],
        channels: ["map"],
        what: message,
        where: `${subject} ${findingLocation(null, page, null)}`,
        evidence: [
          findingRef(
            "map",
            artifact.path,
            page === null ? artifact.scope : scopeV1({ context: aggregateDimension(), page: exactDimension(pageIndex(page)), window: aggregateDimension() }),
          ),
        ],
        completeness: "complete",
        conflicts: [],
        occurrences: 1,
        correlation: `map:${field}:${findingSymptom(message)}`,
      });
    }
  }
  return drafts;
}

async function readCoreDrafts(artifact: SnapRunArtifact, diagnostics: readonly FindingDraft[]): Promise<readonly FindingDraft[]> {
  const rows = parseCoreRows(artifact.path, record(await readJson(artifact.path)));
  return [
    // Drive failures lead: a step that never ran is the reason every row under it is suspect.
    ...coreDriveFailureDrafts(artifact, rows.captures),
    ...corePageErrorDrafts(artifact.path, rows.pageErrors, diagnostics),
    ...coreRequestDrafts(artifact.path, rows.failedRequests, diagnostics),
    ...coreMapDrafts(artifact, rows.captures),
  ];
}

export async function coreFindingDrafts(artifacts: readonly SnapRunArtifact[], diagnostics: readonly FindingDraft[]): Promise<FindingDraft[]> {
  const drafts: FindingDraft[] = [];
  for (const artifact of artifacts.filter((candidate) => candidate.relativePath === "evidence/core-capture.json")) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): composite display owns parser drift by persisting a malformed-evidence finding; the strict detailed reader still refuses the source artifact. Ends if malformedFinding stops retaining the caught error.
    try {
      drafts.push(...(await readCoreDrafts(artifact, diagnostics)));
    } catch (error) {
      drafts.push(malformedFinding(artifact, error, { arms: [], channel: "core-capture", source: "core-capture" }));
    }
  }
  return drafts;
}

function harFailureText(entry: Readonly<Record<string, unknown>> | null): string | null {
  const orb = record(entry?.["_orb"]);
  const failure = record(orb?.["failure"]);
  const response = record(entry?.["response"]);
  if (typeof failure?.["errorText"] === "string") {
    return failure["errorText"];
  }
  const status = response?.["status"];
  return typeof status === "number" && status >= HTTP_ERROR_MIN ? `HTTP ${String(status)}` : null;
}

function harEntryDraft(value: unknown, artifact: SnapRunArtifact): FindingDraft | null {
  const entry = record(value);
  const failureText = harFailureText(entry);
  if (failureText === null) {
    return null;
  }
  const orb = record(entry?.["_orb"]);
  const request = record(entry?.["request"]);
  const context = typeof orb?.["contextIndex"] === "number" ? orb["contextIndex"] : null;
  const page = typeof orb?.["pageIndex"] === "number" ? orb["pageIndex"] : null;
  const window = typeof orb?.["evidenceWindow"] === "number" ? String(orb["evidenceWindow"]) : null;
  const requestId = typeof orb?.["requestId"] === "string" ? orb["requestId"] : null;
  const normalized = findingSymptom(failureText);
  const correlation = normalized.startsWith("net::") || requestId === null ? `symptom:${normalized}` : `request:${requestId}`;
  return {
    severity: "error",
    arms: ["requests"],
    channels: ["har"],
    what: failureText,
    where: `${String(request?.["method"] ?? "request")} ${String(request?.["url"] ?? "(unknown URL)")}`,
    evidence: [findingRef("har", artifact.path, context === null || page === null || window === null ? artifact.scope : exactScope(context, page, window))],
    completeness: findingCompleteness(artifact),
    conflicts: [],
    occurrences: 1,
    correlation,
  };
}

async function readHarDrafts(artifact: SnapRunArtifact): Promise<readonly FindingDraft[]> {
  const parsed = record(await readJson(artifact.path));
  const entries = record(parsed?.["log"])?.["entries"];
  if (!Array.isArray(entries)) {
    throw new Error(`${artifact.path} has no HAR entry population`);
  }
  const drafts: FindingDraft[] = [];
  for (const value of entries) {
    const draft = harEntryDraft(value, artifact);
    if (draft !== null) {
      drafts.push(draft);
    }
  }
  return drafts;
}

export async function harFindingDrafts(artifacts: readonly SnapRunArtifact[]): Promise<FindingDraft[]> {
  const drafts: FindingDraft[] = [];
  for (const artifact of artifacts.filter((candidate) => candidate.relativePath.endsWith(".har"))) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): composite display owns parser drift by persisting a malformed-evidence finding; the strict detailed reader still refuses the source artifact. Ends if malformedFinding stops retaining the caught error.
    try {
      drafts.push(...(await readHarDrafts(artifact)));
    } catch (error) {
      drafts.push(malformedFinding(artifact, error, { arms: ["requests"], channel: "har", source: "har" }));
    }
  }
  return drafts;
}
