// Browser-channel readers for diagnostics, the redacted core capture, and HAR evidence. The typed
// console-annotation parser and diagnostic-draft reader live in run-finding-console-annotation.ts
// (moved out to hold the 450-line cap); re-exported here so callers keep one import surface.

import { aggregateDimension, exactDimension, exactScope, pageIndex, scopeV1 } from "../../floor/artifacts/artifact-scope.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { DriveFailure } from "../contract/actions.ts";
import type { CoreCapturePopulations } from "../contract/core-capture.ts";
import { CORE_CAPTURE_BASIS } from "../contract/core-capture.ts";
import type { SnapCompositeFinding, SnapFindingEvidenceRef, SnapRunArtifact } from "../contract/run-index.ts";
import type { FindingDraft } from "./run-finding-common.ts";
import {
  countedBy,
  findingCompleteness,
  findingIdentity,
  findingLocation,
  findingRef,
  findingSymptom,
  malformedFinding,
  readJson,
  record,
} from "./run-finding-common.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

const HTTP_ERROR_MIN = 400;

function requestLocation(request: Readonly<Record<string, unknown>> | null): string {
  const method = request?.["method"];
  const url = request?.["url"];
  return `${typeof method === "string" ? method : "request"} ${typeof url === "string" ? url : "(unknown URL)"}`;
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
  /** What the page-error receipt says about the population the rows were drawn from. */
  readonly pageErrorCompleteness: SnapCompositeFinding["completeness"];
}

type FixedPopulation = "failedRequests" | "captures";

// The two populations whose `dropped` and `complete` the writer states as literals (see the contract type).
const FIXED_RECEIPTS = {
  failedRequests: { dropped: null, complete: false },
  captures: { dropped: 0, complete: true },
} as const satisfies { readonly [Name in FixedPopulation]: Pick<CoreCapturePopulations[Name], "dropped" | "complete"> };

function receiptError(path: string, name: keyof CoreCapturePopulations): Error {
  return new Error(`${path} has a missing or inconsistent ${name} completeness receipt`);
}

function receiptOf(
  path: string,
  populations: Readonly<Record<string, unknown>> | null,
  name: keyof CoreCapturePopulations,
  rows: readonly unknown[],
): Readonly<Record<string, unknown>> {
  const receipt = record(populations?.[name]);
  if (receipt?.["records"] !== rows.length || receipt["basis"] !== CORE_CAPTURE_BASIS[name]) {
    throw receiptError(path, name);
  }
  return receipt;
}

function assertFixedReceipt(path: string, populations: Readonly<Record<string, unknown>> | null, name: FixedPopulation, rows: readonly unknown[]): void {
  const receipt = receiptOf(path, populations, name, rows);
  if (receipt["dropped"] !== FIXED_RECEIPTS[name].dropped || receipt["complete"] !== FIXED_RECEIPTS[name].complete) {
    throw receiptError(path, name);
  }
}

/** The page-error ring reports its own retention, so every coherent receipt is a valid population: complete,
 *  evicted (`dropped` > 0) or unmeasured. Only a receipt that claims completeness over a drop is a contradiction. */
function pageErrorCompleteness(
  path: string,
  populations: Readonly<Record<string, unknown>> | null,
  rows: readonly unknown[],
): SnapCompositeFinding["completeness"] {
  const receipt = receiptOf(path, populations, "pageErrors", rows);
  const dropped = receipt["dropped"];
  const complete = receipt["complete"];
  if (typeof dropped !== "number" || !Number.isInteger(dropped) || dropped < 0 || typeof complete !== "boolean" || (complete && dropped !== 0)) {
    throw receiptError(path, "pageErrors");
  }
  if (complete) {
    return "complete";
  }
  return dropped > 0 ? "bounded" : "incomplete";
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
  const populations = record(parsed["populations"]);
  assertFixedReceipt(path, populations, "failedRequests", failedRequests);
  assertFixedReceipt(path, populations, "captures", captures);
  return { pageErrors, failedRequests, captures, pageErrorCompleteness: pageErrorCompleteness(path, populations, pageErrors) };
}

function corePageErrorDrafts(
  path: string,
  rows: readonly unknown[],
  completeness: SnapCompositeFinding["completeness"],
  diagnostics: readonly FindingDraft[],
): FindingDraft[] {
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
      completeness,
      conflicts: [],
      occurrences: 1,
      disposition: countedBy("page-errors"),
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
      where: requestLocation(request),
      evidence: [findingRef("core-capture", path, identity?.scope)],
      completeness: "bounded",
      conflicts: [],
      occurrences: 1,
      disposition: countedBy("failed-req"),
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
  return { index: Number(index), kind, flag, subject, reason };
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
        disposition: countedBy("steps-failed"),
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
        disposition: countedBy("map-fails"),
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
    ...corePageErrorDrafts(artifact.path, rows.pageErrors, rows.pageErrorCompleteness, diagnostics),
    ...coreRequestDrafts(artifact.path, rows.failedRequests, diagnostics),
    ...coreMapDrafts(artifact, rows.captures),
  ];
}

export async function coreFindingDrafts(artifacts: readonly SnapRunArtifact[], diagnostics: readonly FindingDraft[]): Promise<FindingDraft[]> {
  const drafts: FindingDraft[] = [];
  for (const artifact of artifacts.filter((candidate) => candidate.relativePath === "evidence/core-capture.json")) {
    // composite display files parser drift as a finding: run-finding-common.ts:81 malformedFinding keeps the caught error in `conflicts` on an error-severity finding that collectSnapFindings files in run.json (ops/run-bundle.ts:154). Ends if malformedFinding stops retaining the caught error.
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
    where: requestLocation(request),
    evidence: [findingRef("har", artifact.path, context === null || page === null || window === null ? artifact.scope : exactScope(context, page, window))],
    completeness: findingCompleteness(artifact),
    conflicts: [],
    occurrences: 1,
    disposition: countedBy("failed-req"),
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
    // composite display files parser drift as a finding: run-finding-common.ts:81 malformedFinding keeps the caught error in `conflicts` on an error-severity finding that collectSnapFindings files in run.json (ops/run-bundle.ts:154). Ends if malformedFinding stops retaining the caught error.
    try {
      drafts.push(...(await readHarDrafts(artifact)));
    } catch (error) {
      drafts.push(malformedFinding(artifact, error, { arms: ["requests"], channel: "har", source: "har" }));
    }
  }
  return drafts;
}
