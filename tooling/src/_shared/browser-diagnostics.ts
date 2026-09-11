// Lossless browser diagnostics gathered through the same Playwright page/context lifecycle as every
// other probe ring. CDP Log/Audits supplement page console/pageerror; they never launch another browser.
import { createTimeLib } from "@orb/kit/time";
import type { CDPSession, Page } from "@playwright/test";
import { exactScope } from "./artifact-scope.ts";
import type {
  BrowserDiagnostic as BrowserDiagnosticContract,
  BrowserPageError,
  DiagnosticLevel as DiagnosticLevelContract,
  DiagnosticOrigin as DiagnosticOriginContract,
  DiagnosticWindow as DiagnosticWindowContract,
  OrbConsoleCompleteness as OrbConsoleCompletenessContract,
} from "./browser-contract.ts";
import { instrumentPageError } from "./browser-contract.ts";
import type { DiagnosticIdentity } from "./browser-diagnostic-events.ts";
import {
  browserLogLevel,
  diagnosticDetails,
  recordAuditIssue,
  recordPageConsole as recordPageConsoleEvent,
  recordPageError as recordPageErrorEvent,
} from "./browser-diagnostic-events.ts";
import type { BoundedEvidenceRing } from "./browser-evidence-ring.ts";
import type { BrowserNetworkLimits } from "./browser-network.ts";
import { wirePageNetwork } from "./browser-network.ts";

const CLOCK = createTimeLib();

export const DIAGNOSTIC_LEVELS = ["verbose", "info", "warning", "error"] as const satisfies readonly DiagnosticLevelContract[];
export type DiagnosticLevel = DiagnosticLevelContract;
export const DIAGNOSTIC_ORIGINS = [
  "page-console",
  "page-error",
  "browser-log",
  "audits",
  "orb-console-ring",
  "instrument-limit",
] as const satisfies readonly DiagnosticOriginContract[];
export type DiagnosticOrigin = DiagnosticOriginContract;
export type BrowserDiagnostic = BrowserDiagnosticContract;
export type DiagnosticWindow = DiagnosticWindowContract;
export type OrbConsoleCompleteness = OrbConsoleCompletenessContract;

export interface OrbConsoleCompletenessSummary {
  readonly source: "orb-console-ring";
  readonly reads: readonly OrbConsoleCompleteness[];
  readonly totals: {
    readonly reads: number;
    readonly records: number;
    readonly dropped: number;
    readonly complete: boolean;
  };
}

const PAGE_IDENTITIES = new WeakMap<Page, DiagnosticIdentity>();
const ORB_RING_STATE = new WeakMap<Page, { records: readonly string[]; dropped: number }>();
const ORB_CONSOLE_SOURCES = ["console", "uncaught", "rejection"] as const;
type OrbConsoleSource = (typeof ORB_CONSOLE_SOURCES)[number];

interface OrbConsoleRecord {
  readonly source: OrbConsoleSource;
  readonly at: number;
  readonly text: string;
  readonly stack: string | null;
  readonly route: string;
}

interface OrbConsoleSnapshot {
  readonly records: readonly OrbConsoleRecord[];
  readonly dropped: number;
  readonly cap: number;
}

function recordLimit(ring: BoundedEvidenceRing<BrowserDiagnostic>, identity: DiagnosticIdentity, text: string): void {
  ring.push(
    {
      origin: "instrument-limit",
      source: "audits",
      level: "warning",
      category: "unsupported",
      text,
      timestamp: CLOCK.now(),
      location: null,
      stack: null,
      requestId: null,
      issueCode: null,
      details: null,
      backendNodeId: null,
      contextIndex: identity.contextIndex,
      pageIndex: identity.pageIndex,
      evidenceWindow: identity.window.value,
      raw: null,
    },
    exactScope(identity.contextIndex, identity.pageIndex, identity.window.value),
  );
}

function instrumentGap(ring: BoundedEvidenceRing<BrowserDiagnostic>, identity: DiagnosticIdentity, text: string, details: unknown): BrowserPageError {
  ring.push(
    {
      origin: "instrument-limit",
      source: "orb-console-ring",
      level: "error",
      category: "incomplete",
      text,
      timestamp: CLOCK.now(),
      location: null,
      stack: null,
      requestId: null,
      issueCode: null,
      details: diagnosticDetails(details),
      backendNodeId: null,
      contextIndex: identity.contextIndex,
      pageIndex: identity.pageIndex,
      evidenceWindow: identity.window.value,
      raw: details,
    },
    exactScope(identity.contextIndex, identity.pageIndex, identity.window.value),
  );
  return instrumentPageError(text);
}

function parseOrbRecord(value: unknown): OrbConsoleRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const source = Reflect.get(value, "source");
  const at = Reflect.get(value, "at");
  const text = Reflect.get(value, "text");
  const route = Reflect.get(value, "route");
  const stack = Reflect.get(value, "stack");
  if (
    !ORB_CONSOLE_SOURCES.includes(source as OrbConsoleSource) ||
    typeof at !== "number" ||
    !Number.isFinite(at) ||
    typeof text !== "string" ||
    typeof route !== "string"
  ) {
    return null;
  }
  if (stack !== undefined && typeof stack !== "string") {
    return null;
  }
  return { source: source as OrbConsoleSource, at, text, route, stack: stack ?? null };
}

function parseOrbSnapshot(value: unknown): OrbConsoleSnapshot | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const rawRecords = Reflect.get(value, "records");
  const dropped = Reflect.get(value, "dropped");
  const cap = Reflect.get(value, "cap");
  if (!(Array.isArray(rawRecords) && Number.isInteger(dropped) && Number.isInteger(cap))) {
    return null;
  }
  const droppedCount = dropped as number;
  const capacity = cap as number;
  if (droppedCount < 0 || capacity <= 0 || rawRecords.length > capacity) {
    return null;
  }
  const records = rawRecords.map(parseOrbRecord);
  return records.some((record) => record === null) ? null : { records: records as OrbConsoleRecord[], dropped: droppedCount, cap: capacity };
}

function overlap(previous: readonly string[], current: readonly string[]): number {
  const max = Math.min(previous.length, current.length);
  for (let size = max; size > 0; size -= 1) {
    if (previous.slice(-size).every((value, index) => value === current[index])) {
      return size;
    }
  }
  return 0;
}

function recordOrbConsole(ring: BoundedEvidenceRing<BrowserDiagnostic>, identity: DiagnosticIdentity, record: OrbConsoleRecord): void {
  ring.push(
    {
      origin: "orb-console-ring",
      source: "orb-console-ring",
      level: "error",
      category: record.source,
      text: record.text,
      timestamp: record.at,
      location: record.route === "" ? null : { url: record.route, line: 0, column: null },
      stack: record.stack,
      requestId: null,
      issueCode: null,
      details: { route: record.route, subtype: record.source },
      backendNodeId: null,
      contextIndex: identity.contextIndex,
      pageIndex: identity.pageIndex,
      evidenceWindow: identity.window.value,
      raw: record,
    },
    exactScope(identity.contextIndex, identity.pageIndex, identity.window.value),
  );
}

export function summarizeOrbConsoleCompleteness(rows: readonly OrbConsoleCompleteness[]): OrbConsoleCompletenessSummary {
  const priorDropped = new Map<string, number>();
  let dropped = 0;
  for (const row of rows) {
    const key = `${row.contextIndex}:${row.pageIndex}`;
    const prior = priorDropped.get(key) ?? 0;
    dropped += row.dropped >= prior ? row.dropped - prior : row.dropped;
    priorDropped.set(key, row.dropped);
  }
  return {
    source: "orb-console-ring",
    reads: rows,
    totals: {
      reads: rows.length,
      records: rows.reduce((total, row) => total + row.records, 0),
      dropped,
      complete: rows.every((row) => row.complete),
    },
  };
}

export async function collectOrbConsoleDiagnostics(
  page: Page,
  ring: BoundedEvidenceRing<BrowserDiagnostic>,
  completeness: BoundedEvidenceRing<OrbConsoleCompleteness>,
  staticFile: boolean,
): Promise<BrowserPageError | null> {
  const identity = PAGE_IDENTITIES.get(page);
  if (identity === undefined) {
    return instrumentPageError("orb console ring has no page identity");
  }
  const read = await page.evaluate(`(() => {
    const orb = globalThis.__orb;
    if (!orb) return { status: "absent", ready: document.documentElement.hasAttribute("data-app-ready") };
    if (typeof orb.consoleErrors !== "function") return { status: "malformed", detail: "consoleErrors is not a function" };
    try { return { status: "value", value: orb.consoleErrors() }; }
    catch (error) { return { status: "malformed", detail: String(error) }; }
  })()`);
  if (typeof read !== "object" || read === null) {
    return instrumentGap(ring, identity, "__orb.consoleErrors() read returned no status", read);
  }
  const status = Reflect.get(read, "status");
  if (status === "absent") {
    return staticFile || Reflect.get(read, "ready") !== true ? null : instrumentGap(ring, identity, "ready app is missing __orb.consoleErrors()", read);
  }
  const snapshot = status === "value" ? parseOrbSnapshot(Reflect.get(read, "value")) : null;
  if (snapshot === null) {
    return instrumentGap(ring, identity, `__orb.consoleErrors() is malformed (${String(Reflect.get(read, "detail") ?? "invalid ring shape")})`, read);
  }
  const keys = snapshot.records.map((record) => JSON.stringify(record));
  const prior = ORB_RING_STATE.get(page) ?? { records: [], dropped: 0 };
  const retainedOverlap = overlap(prior.records, keys);
  for (const record of snapshot.records.slice(retainedOverlap)) {
    recordOrbConsole(ring, identity, record);
  }
  const row: OrbConsoleCompleteness = {
    contextIndex: identity.contextIndex,
    pageIndex: identity.pageIndex,
    evidenceWindow: identity.window.value,
    records: snapshot.records.length,
    dropped: snapshot.dropped,
    cap: snapshot.cap,
    complete: snapshot.dropped === 0,
  };
  completeness.push(row, exactScope(identity.contextIndex, identity.pageIndex, identity.window.value));
  ORB_RING_STATE.set(page, { records: keys, dropped: snapshot.dropped });
  return snapshot.dropped > prior.dropped
    ? instrumentGap(ring, identity, `__orb.consoleErrors() dropped ${snapshot.dropped - prior.dropped} record(s) at cap ${snapshot.cap}`, row)
    : null;
}

export const recordPageConsole = recordPageConsoleEvent;
export const recordPageError = recordPageErrorEvent;

interface WirePageDiagnosticsOptions {
  readonly cdp?: CDPSession;
  readonly network?: BrowserNetworkLimits;
}

export async function wirePageDiagnostics(
  page: Page,
  ring: BoundedEvidenceRing<BrowserDiagnostic>,
  identity: DiagnosticIdentity,
  options: WirePageDiagnosticsOptions = {},
): Promise<void> {
  PAGE_IDENTITIES.set(page, identity);
  const cdp = options.cdp ?? (await page.context().newCDPSession(page));
  cdp.on("Log.entryAdded", ({ entry }) => {
    ring.push(
      {
        origin: "browser-log",
        source: entry.source,
        level: browserLogLevel(entry.level),
        category: entry.category ?? null,
        text: entry.text,
        timestamp: entry.timestamp,
        location: entry.url === undefined ? null : { url: entry.url, line: entry.lineNumber ?? 0, column: null },
        stack: entry.stackTrace ?? null,
        requestId: entry.networkRequestId ?? null,
        issueCode: null,
        details: null,
        backendNodeId: null,
        contextIndex: identity.contextIndex,
        pageIndex: identity.pageIndex,
        evidenceWindow: identity.window.value,
        raw: entry,
      },
      exactScope(identity.contextIndex, identity.pageIndex, identity.window.value),
    );
  });
  cdp.on("Audits.issueAdded", ({ issue }) => {
    recordAuditIssue(ring, identity, issue);
  });
  await cdp.send("Log.enable");
  await wirePageNetwork(cdp, page, identity, options.network);
  // @orb-waive caught-failure-ownership(error): unsupported experimental Audits becomes an explicit instrument-limit diagnostic; Log capture remains live. Ends if the limit record stops carrying the caught detail.
  try {
    await cdp.send("Audits.enable");
  } catch (error) {
    recordLimit(ring, identity, `Audits.enable unsupported: ${error instanceof Error ? error.message : String(error)}`);
  }
}
