import { createTimeLib } from "@orb/kit/time";
import type { ConsoleMessage } from "@playwright/test";
import { exactScope } from "./artifact-scope.ts";
import type { BrowserDiagnostic, BrowserDiagnosticDetails, DiagnosticLevel, DiagnosticWindow } from "./browser-contract.ts";
import type { BoundedEvidenceRing } from "./browser-evidence-ring.ts";

const CLOCK = createTimeLib();

export interface DiagnosticIdentity {
  readonly contextIndex: number;
  readonly pageIndex: number;
  readonly window: DiagnosticWindow;
}

function levelOf(type: string): DiagnosticLevel {
  if (type === "debug") {
    return "verbose";
  }
  if (type === "error" || type === "warning" || type === "verbose") {
    return type;
  }
  return "info";
}

function nestedValue<T>(value: unknown, keys: ReadonlySet<string>, predicate: (child: unknown) => child is T): T | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && predicate(child)) {
      return child;
    }
    const nested = nestedValue(child, keys, predicate);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

export function diagnosticDetails(value: unknown): BrowserDiagnosticDetails {
  if (typeof value === "object" && value !== null) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value ?? "no details");
}

export function recordAuditIssue(
  ring: BoundedEvidenceRing<BrowserDiagnostic>,
  identity: DiagnosticIdentity,
  issue: { readonly code: string; readonly details: unknown },
): void {
  const generic = typeof issue.details === "object" && issue.details !== null ? Reflect.get(issue.details, "genericIssueDetails") : null;
  const errorType =
    typeof generic === "object" && generic !== null && typeof Reflect.get(generic, "errorType") === "string" ? String(Reflect.get(generic, "errorType")) : null;
  ring.push(
    {
      origin: "audits",
      source: "audits",
      level: "warning",
      category: errorType ?? issue.code,
      text: errorType === null ? issue.code : `${issue.code}: ${errorType}`,
      timestamp: CLOCK.now(),
      location: null,
      stack: null,
      requestId: nestedValue(issue.details, new Set(["requestId"]), (child): child is string => typeof child === "string"),
      issueCode: issue.code,
      details: diagnosticDetails(issue.details),
      backendNodeId: nestedValue(issue.details, new Set(["violatingNodeId", "nodeId", "backendNodeId"]), (child): child is number => typeof child === "number"),
      contextIndex: identity.contextIndex,
      pageIndex: identity.pageIndex,
      evidenceWindow: identity.window.value,
      raw: issue,
    },
    exactScope(identity.contextIndex, identity.pageIndex, identity.window.value),
  );
}

export function recordPageConsole(ring: BoundedEvidenceRing<BrowserDiagnostic>, identity: DiagnosticIdentity, message: ConsoleMessage): void {
  const location = message.location();
  ring.push(
    {
      origin: "page-console",
      source: "console-api",
      level: levelOf(message.type()),
      category: "console",
      text: message.text(),
      timestamp: CLOCK.now(),
      location: location.url ? { url: location.url, line: location.lineNumber, column: location.columnNumber } : null,
      stack: null,
      requestId: null,
      issueCode: null,
      details: null,
      backendNodeId: null,
      contextIndex: identity.contextIndex,
      pageIndex: identity.pageIndex,
      evidenceWindow: identity.window.value,
      raw: { type: message.type(), text: message.text(), location },
    },
    exactScope(identity.contextIndex, identity.pageIndex, identity.window.value),
  );
}

export function recordPageError(ring: BoundedEvidenceRing<BrowserDiagnostic>, identity: DiagnosticIdentity, error: Error): void {
  ring.push(
    {
      origin: "page-error",
      source: "runtime",
      level: "error",
      category: "uncaught",
      text: `${error.name}: ${error.message}`,
      timestamp: CLOCK.now(),
      location: null,
      stack: error.stack ?? null,
      requestId: null,
      issueCode: null,
      details: null,
      backendNodeId: null,
      contextIndex: identity.contextIndex,
      pageIndex: identity.pageIndex,
      evidenceWindow: identity.window.value,
      raw: { name: error.name, message: error.message, stack: error.stack ?? null },
    },
    exactScope(identity.contextIndex, identity.pageIndex, identity.window.value),
  );
}

export function browserLogLevel(type: string): DiagnosticLevel {
  return levelOf(type);
}
