// The SnapRunIndex shape assertion, moved out of run-report.ts to hold the 450-line cap: every field
// group (identity, process, provenance, verdict, diagnostics, findings) validated strictly so a
// malformed index refuses loudly instead of feeding a downstream reader `undefined`.
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { evidenceWindowIdSchema, instrumentEvidenceScopeSchema } from "../../_shared/artifact-scope.ts";
import { DIAGNOSTIC_LEVELS } from "../../_shared/browser-diagnostics.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { SNAP_ARM_STATES } from "../contract/run-facts.ts";
import type { SnapRunIndex } from "../contract/run-index.ts";
import { checkoutLocation, isRecord, validGitFailures } from "../lib/run-report-identity.ts";
import { ARM_DEFS } from "./arms/registry.ts";
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

export function assertIndex(value: unknown, path: string): asserts value is SnapRunIndex {
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
