// The session substrate's WIRE readers — ONE grammar for
// the daemon and the client: a request line off the socket, a registry row off disk, an event line back,
// and the RESULT pairs a call's captured lines carry. Every reader validates field by field and answers
// null to anything off-grammar — a daemon on another protocol version, a truncated row, a torn line —
// so nothing half-read is ever mistaken for a verdict. Split from ./session-plan.ts (the partition,
// verdicts and refusal texts) at the tooling size cap; pinned by tests/tooling/snap/lib/session-wire.test.ts.
import type { OrbConsoleCompleteness, OrbConsoleCompletenessSummary } from "../../_shared/browser-diagnostics.ts";
import { parseSnapRunResults, SNAP_RUN_RESULTS_VERSION } from "../contract/run-facts.ts";
import type { SessionBinding, SessionEvent, SessionPageInfo, SessionRequest, SessionRow, SessionRunProvenance } from "../contract/session.ts";
import { SESSION_PROTOCOL_VERSION, SESSION_REQUEST_KINDS } from "../contract/session.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  // @orb-waive caught-failure-ownership(catch): a malformed line IS the negative answer both readers return — the daemon refuses the request as a protocol error and the client treats the row as unreadable; `null` is that answer at every call site. Ends if a caller starts needing WHY the bytes did not parse.
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isSessionRequestKind(value: unknown): value is SessionRequest["kind"] {
  return typeof value === "string" && SESSION_REQUEST_KINDS.some((candidate) => candidate === value);
}

export function readSessionRequest(line: string): SessionRequest | null {
  const record = parseJsonObject(line);
  if (record === null || record["v"] !== SESSION_PROTOCOL_VERSION) {
    return null;
  }
  const kind = record["kind"];
  if (!isSessionRequestKind(kind)) {
    return null;
  }
  const { runId, slotDir, argv, cwd, checkout } = record;
  if (typeof runId !== "string" || typeof slotDir !== "string" || !isStringArray(argv) || typeof cwd !== "string" || typeof checkout !== "string") {
    return null;
  }
  if (
    (Object.hasOwn(record, "boot") && typeof record["boot"] !== "boolean") ||
    (Object.hasOwn(record, "force") && typeof record["force"] !== "boolean") ||
    (Object.hasOwn(record, "exportOut") && !nullableString(record["exportOut"]))
  ) {
    return null;
  }
  return {
    v: SESSION_PROTOCOL_VERSION,
    kind,
    runId,
    slotDir,
    argv,
    cwd,
    checkout,
    boot: record["boot"] === true,
    force: record["force"] === true,
    exportOut: typeof record["exportOut"] === "string" ? record["exportOut"] : null,
  };
}

function sessionEnvironment(value: unknown): SessionRow["environment"] | null {
  if (!(isRecord(value) && isRecord(value["viewport"]))) {
    return null;
  }
  const viewport = value["viewport"];
  const { device, colorScheme, reducedMotion, contrast, reducedTransparency, deviceScaleFactor, viewportExplicit } = value;
  if (
    (viewportExplicit !== undefined && typeof viewportExplicit !== "boolean") ||
    !(Number.isInteger(viewport["width"]) && Number.isInteger(viewport["height"])) ||
    Number(viewport["width"]) <= 0 ||
    Number(viewport["height"]) <= 0 ||
    !nullableString(device) ||
    !(colorScheme === null || colorScheme === "light" || colorScheme === "dark") ||
    typeof reducedMotion !== "boolean" ||
    !(contrast === null || contrast === "more" || contrast === "no-preference") ||
    typeof reducedTransparency !== "boolean" ||
    !(deviceScaleFactor === null || (typeof deviceScaleFactor === "number" && Number.isFinite(deviceScaleFactor) && deviceScaleFactor > 0))
  ) {
    return null;
  }
  return {
    viewport: { width: Number(viewport["width"]), height: Number(viewport["height"]) },
    // The #1668 override marker rides the row (a session BOOTS its context from it); dropping it here
    // would hand every later call the device's own size — the row-reader half of the lie the field closes.
    ...(viewportExplicit === undefined ? {} : { viewportExplicit }),
    device,
    colorScheme,
    reducedMotion,
    contrast,
    reducedTransparency,
    deviceScaleFactor,
  };
}

function sessionStageState(value: unknown): NonNullable<SessionRow["stage"]> | null {
  if (!isRecord(value)) {
    return null;
  }
  const { band, status, detectedAt, op, ownerCheckout, ref, binding: rawBinding } = value;
  const binding = rawBinding === undefined ? undefined : sessionBinding(rawBinding);
  if (
    !Number.isInteger(band) ||
    Number(band) < 0 ||
    !(status === "live" || status === "dead") ||
    !nullableString(detectedAt) ||
    !nullableString(op) ||
    !(ownerCheckout === undefined || typeof ownerCheckout === "string") ||
    !(ref === undefined || typeof ref === "string") ||
    (rawBinding !== undefined && binding === null)
  ) {
    return null;
  }
  return {
    band: Number(band),
    status,
    detectedAt,
    op,
    ...(ownerCheckout === undefined ? {} : { ownerCheckout }),
    ...(ref === undefined ? {} : { ref }),
    ...(binding === undefined || binding === null ? {} : { binding }),
  };
}

/** A row is trusted only when its ownership facts parse — a row that cannot name its owner or its daemon
 *  cannot be reasoned about across checkouts and reads as absent (the stage marker's posture). */
function sessionRowFrom(value: unknown): SessionRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const record = value;
  if (record["v"] !== SESSION_PROTOCOL_VERSION) {
    return null;
  }
  const binding = sessionBinding(record["binding"]);
  const environment = sessionEnvironment(record["environment"]);
  const stageValue = record["stage"];
  const stage = stageValue === undefined || stageValue === null ? stageValue : sessionStageState(stageValue);
  if (
    typeof record["name"] !== "string" ||
    typeof record["ownerCheckout"] !== "string" ||
    !Number.isInteger(record["daemonPid"]) ||
    !Number.isInteger(record["pgid"]) ||
    typeof record["socket"] !== "string" ||
    !nullableString(record["cdpEndpoint"]) ||
    typeof record["slotDir"] !== "string" ||
    binding === null ||
    environment === null ||
    (stageValue !== undefined && stageValue !== null && stage === null) ||
    !isStringArray(record["bootArgv"]) ||
    typeof record["createdAt"] !== "string" ||
    typeof record["lastUsedAt"] !== "string" ||
    !nullableString(record["inflightOp"]) ||
    !nullableString(record["lastOp"]) ||
    !Number.isInteger(record["ttlMs"]) ||
    Number(record["ttlMs"]) < 0 ||
    typeof record["headless"] !== "boolean" ||
    !Number.isInteger(record["calls"]) ||
    Number(record["calls"]) < 0
  ) {
    return null;
  }
  return {
    v: SESSION_PROTOCOL_VERSION,
    name: record["name"],
    ownerCheckout: record["ownerCheckout"],
    daemonPid: Number(record["daemonPid"]),
    pgid: Number(record["pgid"]),
    socket: record["socket"],
    cdpEndpoint: record["cdpEndpoint"],
    slotDir: record["slotDir"],
    binding,
    ...(stage === undefined ? {} : { stage }),
    environment,
    bootArgv: record["bootArgv"],
    createdAt: record["createdAt"],
    lastUsedAt: record["lastUsedAt"],
    inflightOp: record["inflightOp"],
    lastOp: record["lastOp"],
    ttlMs: Number(record["ttlMs"]),
    headless: record["headless"],
    calls: Number(record["calls"]),
  };
}

export function readSessionRow(text: string): SessionRow | null {
  return sessionRowFrom(parseJsonObject(text));
}

function isPair(value: unknown): value is readonly [string, string] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string";
}

function isPageInfo(value: unknown): value is SessionPageInfo {
  if (!isRecord(value)) {
    return false;
  }
  return Number.isInteger(value["index"]) && typeof value["url"] === "string" && typeof value["title"] === "string";
}

function isOrbConsoleCompleteness(value: unknown): value is OrbConsoleCompleteness {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Number.isInteger(value["contextIndex"]) &&
    Number.isInteger(value["pageIndex"]) &&
    Number.isInteger(value["evidenceWindow"]) &&
    Number.isInteger(value["records"]) &&
    Number.isInteger(value["dropped"]) &&
    Number.isInteger(value["cap"]) &&
    typeof value["complete"] === "boolean"
  );
}

function orbConsoleSummary(value: unknown): OrbConsoleCompletenessSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  const totals = value["totals"];
  if (value["source"] !== "orb-console-ring" || !Array.isArray(value["reads"]) || !isRecord(totals)) {
    return null;
  }
  const complete = totals["complete"];
  const validTotals =
    Number.isInteger(totals["reads"]) && Number.isInteger(totals["records"]) && Number.isInteger(totals["dropped"]) && typeof complete === "boolean";
  if (!(value["reads"].every(isOrbConsoleCompleteness) && validTotals)) {
    return null;
  }
  return {
    source: "orb-console-ring",
    reads: value["reads"],
    totals: {
      reads: Number(totals["reads"]),
      records: Number(totals["records"]),
      dropped: Number(totals["dropped"]),
      complete,
    },
  };
}

function sessionBinding(value: unknown): SessionBinding | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value["kind"];
  return (kind === "base" || kind === "file" || kind === "stage") && typeof value["url"] === "string" ? { kind, url: value["url"] } : null;
}

function sessionStageProvenance(value: unknown): NonNullable<SessionRunProvenance["stage"]> | null {
  if (!isRecord(value)) {
    return null;
  }
  const record = value;
  const binding = sessionBinding(record["binding"]);
  const state = record["state"];
  const owner = record["ownerCheckout"];
  const band = record["band"];
  const ref = record["ref"];
  const failure = record["failure"];
  if (
    !(
      (state === "bound" || state === "not-applicable" || state === "unavailable") &&
      (owner === null || typeof owner === "string") &&
      (band === null || (Number.isInteger(band) && Number(band) >= 0)) &&
      (ref === null || typeof ref === "string")
    ) ||
    binding === null ||
    !(failure === null || typeof failure === "string")
  ) {
    return null;
  }
  return {
    state,
    ownerCheckout: owner,
    band: band === null ? null : Number(band),
    ref,
    binding,
    failure,
  };
}

function sessionRunProvenance(value: unknown): SessionRunProvenance | null {
  if (!isRecord(value)) {
    return null;
  }
  const record = value;
  const binding = sessionBinding(record["binding"]);
  const stage = record["stage"] === undefined ? undefined : sessionStageProvenance(record["stage"]);
  if (
    typeof record["name"] !== "string" ||
    !Number.isInteger(record["call"]) ||
    Number(record["call"]) < 0 ||
    !Number.isInteger(record["evidenceWindow"]) ||
    Number(record["evidenceWindow"]) < 0 ||
    binding === null ||
    stage === null
  ) {
    return null;
  }
  return {
    name: record["name"],
    call: Number(record["call"]),
    evidenceWindow: Number(record["evidenceWindow"]),
    binding,
    ...(stage === undefined ? {} : { stage }),
  };
}

type SessionDoneEvent = Extract<SessionEvent, { readonly kind: "done" }>;

function doneFacts(value: unknown): { readonly ok: true; readonly facts?: SessionDoneEvent["facts"] } | { readonly ok: false } {
  if (value === undefined) {
    return { ok: true };
  }
  try {
    return { ok: true, facts: parseSnapRunResults({ v: SNAP_RUN_RESULTS_VERSION, batches: value }).batches };
  } catch {
    return { ok: false };
  }
}

function doneEventFrom(record: Readonly<Record<string, unknown>>): SessionDoneEvent | null {
  if (typeof record["exit"] !== "number" || !Array.isArray(record["pairs"])) {
    return null;
  }
  const diagnostics = record["diagnosticCompleteness"];
  const provenance = record["sessionProvenance"];
  const parsedFacts = doneFacts(record["facts"]);
  if (!parsedFacts.ok) {
    return null;
  }
  const base = {
    kind: "done" as const,
    exit: record["exit"],
    pairs: record["pairs"].filter(isPair),
    ...(parsedFacts.facts === undefined ? {} : { facts: parsedFacts.facts }),
  };
  if (diagnostics !== undefined) {
    const parsedDiagnostics = orbConsoleSummary(diagnostics);
    if (parsedDiagnostics === null) {
      return null;
    }
    if (provenance === undefined) {
      return { ...base, diagnosticCompleteness: parsedDiagnostics };
    }
    const parsedProvenance = sessionRunProvenance(provenance);
    return parsedProvenance === null ? null : { ...base, diagnosticCompleteness: parsedDiagnostics, sessionProvenance: parsedProvenance };
  }
  if (provenance !== undefined) {
    const parsedProvenance = sessionRunProvenance(provenance);
    return parsedProvenance === null ? null : { ...base, sessionProvenance: parsedProvenance };
  }
  return base;
}

/** The client's reader for one daemon event line — the grammar `SessionEvent` declares, validated field by
 *  field so a daemon on another protocol version cannot be misread as a verdict. */
export function readSessionEvent(line: string): SessionEvent | null {
  const record = parseJsonObject(line);
  if (record === null) {
    return null;
  }
  const kind = record["kind"];
  if ((kind === "line" || kind === "warn") && typeof record["text"] === "string") {
    return { kind, text: record["text"] };
  }
  if (kind === "done") {
    return doneEventFrom(record);
  }
  if (kind === "status") {
    const row = sessionRowFrom(record["row"]);
    const busy = record["busy"];
    if (row === null || !Array.isArray(record["pages"]) || typeof record["idleMs"] !== "number" || !(busy === null || typeof busy === "string")) {
      return null;
    }
    return { kind, row, pages: record["pages"].filter(isPageInfo), busy, idleMs: record["idleMs"] };
  }
  return null;
}

/** The instrument's `RESULT <tool> k=v …` pairs from a captured line set. The run-bundle receipt appends
 *  its own `RESULT snap exit=… index=…` envelope after the instrument result; that receipt describes the
 *  slot, not the browser call, so session parity and the daemon wire skip it. Split on the first `=`. */
export function resultPairsOf(lines: readonly string[]): readonly (readonly [string, string])[] {
  const result = lines.findLast((line) => line.startsWith("RESULT ") && !/^RESULT snap exit=\d+ index=/u.test(line));
  if (result === undefined) {
    return [];
  }
  return result
    .split(" ")
    .slice(2)
    .flatMap((token): (readonly [string, string])[] => {
      const eq = token.indexOf("=");
      return eq === -1 ? [] : [[token.slice(0, eq), token.slice(eq + 1)]];
    });
}
