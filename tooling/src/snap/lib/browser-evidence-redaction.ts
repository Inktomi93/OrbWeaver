// The browser-evidence disk door. Diagnostics deliberately retain their correlation and provenance
// fields while every page-controlled string/object crosses the same URL, credential, and size policy.

import type { CapturedConsole, CapturedRequest } from "../../_shared/browser-capture.ts";
import type { BrowserPageError } from "../../_shared/browser-contract.ts";
import type { BrowserDiagnostic } from "../../_shared/browser-diagnostics.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type {
  DiskSafeBrowserDiagnostic,
  DiskSafeBrowserDiagnostics,
  DiskSafeBrowserPageError,
  DiskSafeCapturedConsole,
  DiskSafeCapturedRequest,
  DiskSafeLimitReceipt,
  DiskSafeTextEvidence,
} from "../contract/browser-evidence-redaction.ts";
import type { NetworkEvidenceLimits, NetworkLimitEvent, RedactedJsonValue } from "../contract/har-redaction.ts";
import { REDACTED } from "../contract/har-redaction.ts";
import { isSensitiveEvidenceName, redactNetworkUrl } from "./har-redaction.ts";
import { resolveNetworkEvidenceLimits } from "./har-redaction-limits.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const OMITTED = "[OMITTED]";
const TRUNCATED = "[TRUNCATED]";
const URL_TOKEN = /(?:[a-z][a-z0-9+.-]*:\/\/|\/\/)[^\s"'<>]+|(?:\/|\.\.?\/)[^\s"'<>]*\?[^\s"'<>]+/giu;
const ASSIGNMENT = /(^|[\s?&;,{[(])([A-Za-z][A-Za-z0-9_.-]{0,100})(\s*[:=]\s*)([^\s&;,}]+)/gimu;
const QUOTED_ASSIGNMENT = /(["'])([A-Za-z][A-Za-z0-9_.-]{0,100})\1(\s*:\s*)(["'])([^"']*)\4/giu;
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/giu;

interface RedactionContext {
  readonly limits: NetworkEvidenceLimits;
  readonly events: NetworkLimitEvent[];
}

interface ValueCursor extends RedactionContext {
  readonly path: string;
  readonly depth: number;
  readonly state: { fields: number };
  readonly active: WeakSet<object>;
}

function receipt(context: RedactionContext): DiskSafeLimitReceipt {
  return { policy: context.limits, events: context.events };
}

function bytePrefix(value: string, maxBytes: number): string {
  let bytes = 0;
  let output = "";
  for (const character of value) {
    const next = Buffer.byteLength(character, "utf8");
    if (bytes + next > maxBytes) {
      break;
    }
    output += character;
    bytes += next;
  }
  return output;
}

function bounded(value: string, path: string, context: RedactionContext): string {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= context.limits.maxStringBytes) {
    return value;
  }
  const retainedTarget = Math.max(0, context.limits.maxStringBytes - Buffer.byteLength(TRUNCATED));
  const prefix = bytePrefix(value, retainedTarget);
  const retained = Buffer.byteLength(prefix);
  context.events.push({ kind: "string", path, original: bytes, retained, omitted: bytes - retained });
  return `${prefix}${TRUNCATED}`;
}

function redactUrls(value: string, path: string, context: RedactionContext): string {
  return value.replace(URL_TOKEN, (candidate) => {
    const safe = redactNetworkUrl(candidate, context.limits);
    context.events.push(...safe._orbMeasuredLimit.events.map((event) => ({ ...event, path: `${path}.url${event.path.slice(1)}` })));
    return safe.url;
  });
}

function safeUrl(value: string, path: string, context: RedactionContext): string {
  const safe = redactNetworkUrl(value, context.limits);
  context.events.push(...safe._orbMeasuredLimit.events.map((event) => ({ ...event, path: `${path}${event.path.slice(1)}` })));
  return safe.url;
}

function redactQuotedAssignment(...parts: unknown[]): string {
  const [match, quote, name, separator, valueQuote] = parts;
  if (typeof match !== "string" || typeof quote !== "string" || typeof name !== "string" || typeof separator !== "string" || typeof valueQuote !== "string") {
    return OMITTED;
  }
  return isSensitiveEvidenceName(name) ? `${quote}${name}${quote}${separator}${valueQuote}${REDACTED}${valueQuote}` : match;
}

function redactAssignments(value: string): string {
  const auth = value.replace(AUTH_SCHEME, REDACTED);
  const quoted = auth.replace(QUOTED_ASSIGNMENT, redactQuotedAssignment);
  return quoted.replace(ASSIGNMENT, (match, prefix: string, name: string, separator: string) =>
    isSensitiveEvidenceName(name) ? `${prefix}${name}${separator}${REDACTED}` : match,
  );
}

function safeText(value: string, path: string, context: RedactionContext): string {
  return bounded(redactAssignments(redactUrls(value, path, context)), path, context);
}

function unreadableValue(cursor: ValueCursor, path: string): RedactedJsonValue {
  cursor.events.push({ kind: "unreadable", path, original: null, retained: 0, omitted: 1 });
  return OMITTED;
}

function child(cursor: ValueCursor, path: string): ValueCursor {
  return { ...cursor, path, depth: cursor.depth + 1 };
}

function objectEntries(value: object, cursor: ValueCursor): readonly [string, unknown][] {
  return Object.keys(value)
    .toSorted()
    .map((key) => {
      // @orb-waive caught-failure-ownership(catch): a hostile diagnostic getter becomes an explicit unreadable marker; its thrown value may contain a page secret and cannot cross the disk boundary. Ends if unreadableValue stops recording the failure.
      try {
        return [key, Reflect.get(value, key)] as const;
      } catch {
        return [key, unreadableValue(cursor, `${cursor.path}.${safeText(key, `${cursor.path}.$key`, cursor)}`)] as const;
      }
    });
}

function retainedFields<T>(source: readonly T[], cursor: ValueCursor): readonly T[] {
  const remaining = Math.max(0, cursor.limits.maxFields - cursor.state.fields);
  const kept = source.slice(0, remaining);
  cursor.state.fields += kept.length;
  if (source.length > kept.length) {
    cursor.events.push({ kind: "fields", path: cursor.path, original: source.length, retained: kept.length, omitted: source.length - kept.length });
  }
  return kept;
}

function structured(value: unknown, cursor: ValueCursor): RedactedJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return typeof value === "number" && !Number.isFinite(value) ? null : value;
  }
  if (typeof value === "string") {
    return safeText(value, cursor.path, cursor);
  }
  if (typeof value !== "object") {
    cursor.events.push({ kind: "unsupported", path: cursor.path, original: null, retained: 0, omitted: 1 });
    return OMITTED;
  }
  if (cursor.active.has(value)) {
    cursor.events.push({ kind: "cycle", path: cursor.path, original: null, retained: 0, omitted: 1 });
    return OMITTED;
  }
  if (cursor.depth >= cursor.limits.maxDepth) {
    cursor.events.push({ kind: "depth", path: cursor.path, original: cursor.depth, retained: cursor.limits.maxDepth, omitted: 1 });
    return OMITTED;
  }
  cursor.active.add(value);
  const result: RedactedJsonValue = Array.isArray(value)
    ? retainedFields(value, cursor).map((member, index) => structured(member, child(cursor, `${cursor.path}[${index}]`)))
    : Object.fromEntries(
        retainedFields(objectEntries(value, cursor), cursor).map(([key, member]) => {
          const safeKey = safeText(key, `${cursor.path}.$key`, cursor);
          return [safeKey, isSensitiveEvidenceName(key) ? REDACTED : structured(member, child(cursor, `${cursor.path}.${safeKey}`))];
        }),
      );
  cursor.active.delete(value);
  return result;
}

function safeValue(value: unknown, path: string, context: RedactionContext): RedactedJsonValue {
  return structured(value, { ...context, path, depth: 0, state: { fields: 0 }, active: new WeakSet() });
}

function fallback(limits: NetworkEvidenceLimits): DiskSafeBrowserDiagnostic {
  const events: NetworkLimitEvent[] = [{ kind: "unreadable", path: "$", original: null, retained: 0, omitted: null }];
  return {
    origin: "instrument-limit",
    source: "redaction",
    level: "error",
    category: "unreadable",
    text: OMITTED,
    timestamp: 0,
    location: null,
    stack: null,
    requestId: null,
    issueCode: null,
    details: null,
    backendNodeId: null,
    contextIndex: 0,
    pageIndex: 0,
    evidenceWindow: 0,
    raw: null,
    _orbMeasuredLimit: { policy: limits, events },
  };
}

export function redactEvidenceText(input: string, overrides: Partial<NetworkEvidenceLimits> = {}): DiskSafeTextEvidence {
  const context: RedactionContext = { limits: resolveNetworkEvidenceLimits(overrides), events: [] };
  return { text: safeText(input, "$.text", context), _orbMeasuredLimit: receipt(context) };
}

export function redactBrowserPageError(input: BrowserPageError, overrides: Partial<NetworkEvidenceLimits> = {}): DiskSafeBrowserPageError {
  const context: RedactionContext = { limits: resolveNetworkEvidenceLimits(overrides), events: [] };
  return {
    kind: input.kind,
    name: input.name === null ? null : safeText(input.name, "$.name", context),
    message: safeText(input.message, "$.message", context),
    stack: input.stack === null ? null : safeText(input.stack, "$.stack", context),
    _orbMeasuredLimit: receipt(context),
  };
}

export function redactBrowserDiagnostic(input: BrowserDiagnostic, overrides: Partial<NetworkEvidenceLimits> = {}): DiskSafeBrowserDiagnostic {
  const limits = resolveNetworkEvidenceLimits(overrides);
  // @orb-waive caught-failure-ownership(catch): hostile outer diagnostic getters fail closed to one generic record; caught content may contain a page secret and is intentionally neither logged nor returned. Ends if fallback stops being the terminal disk-safe result.
  try {
    const context: RedactionContext = { limits, events: [] };
    return {
      origin: input.origin,
      source: safeText(input.source, "$.source", context),
      level: input.level,
      category: input.category === null ? null : safeText(input.category, "$.category", context),
      text: safeText(input.text, "$.text", context),
      timestamp: input.timestamp,
      location:
        input.location === null
          ? null
          : { url: safeUrl(input.location.url, "$.location.url", context), line: input.location.line, column: input.location.column },
      stack: safeValue(input.stack, "$.stack", context),
      requestId: input.requestId === null ? null : safeText(input.requestId, "$.requestId", context),
      issueCode: input.issueCode === null ? null : safeText(input.issueCode, "$.issueCode", context),
      details: safeValue(input.details, "$.details", context),
      backendNodeId: input.backendNodeId,
      contextIndex: input.contextIndex,
      pageIndex: input.pageIndex,
      evidenceWindow: input.evidenceWindow,
      raw: safeValue(input.raw, "$.raw", context),
      _orbMeasuredLimit: receipt(context),
    };
  } catch {
    return fallback(limits);
  }
}

export function redactBrowserDiagnostics(input: readonly BrowserDiagnostic[], overrides: Partial<NetworkEvidenceLimits> = {}): DiskSafeBrowserDiagnostics {
  const limits = resolveNetworkEvidenceLimits(overrides);
  // @orb-waive caught-failure-ownership(catch): a hostile diagnostic collection fails closed to an empty batch with an unreadable receipt; caught content may contain a page secret and is not surfaced. Ends if the receipt stops owning the failure.
  try {
    const retained = input.slice(0, limits.maxEntries).map((entry) => redactBrowserDiagnostic(entry, limits));
    const events: NetworkLimitEvent[] =
      input.length > retained.length
        ? [{ kind: "entries", path: "$", original: input.length, retained: retained.length, omitted: input.length - retained.length }]
        : [];
    return { records: retained, _orbMeasuredLimit: { policy: limits, events } };
  } catch {
    return {
      records: [],
      _orbMeasuredLimit: { policy: limits, events: [{ kind: "unreadable", path: "$", original: null, retained: 0, omitted: null }] },
    };
  }
}

export function redactCapturedConsole(input: CapturedConsole, overrides: Partial<NetworkEvidenceLimits> = {}): DiskSafeCapturedConsole {
  const limits = resolveNetworkEvidenceLimits(overrides);
  // @orb-waive caught-failure-ownership(catch): hostile captured-console getters fail closed to a generic explicit omission; thrown content may contain a page secret and is not surfaced. Ends if the fallback stops being disk-safe.
  try {
    const context: RedactionContext = { limits, events: [] };
    return {
      type: safeText(input.type, "$.type", context),
      text: safeText(input.text, "$.text", context),
      location: input.location === null ? null : { ...input.location, url: safeUrl(input.location.url, "$.location.url", context) },
      line: safeText(input.line, "$.line", context),
      _orbMeasuredLimit: receipt(context),
    };
  } catch {
    return {
      type: "error",
      text: OMITTED,
      location: null,
      line: OMITTED,
      _orbMeasuredLimit: { policy: limits, events: [{ kind: "unreadable", path: "$", original: null, retained: 0, omitted: null }] },
    };
  }
}

export function redactCapturedRequest(input: CapturedRequest, overrides: Partial<NetworkEvidenceLimits> = {}): DiskSafeCapturedRequest {
  const limits = resolveNetworkEvidenceLimits(overrides);
  // @orb-waive caught-failure-ownership(catch): hostile request-summary getters fail closed to a generic omission; thrown content may contain a page secret and is not surfaced. Ends if the fallback stops being disk-safe.
  try {
    const context: RedactionContext = { limits, events: [] };
    return {
      method: safeText(input.method, "$.method", context),
      url: safeUrl(input.url, "$.url", context),
      status: input.status,
      failed: input.failed === null ? null : safeText(input.failed, "$.failed", context),
      type: safeText(input.type, "$.type", context),
      _orbMeasuredLimit: receipt(context),
    };
  } catch {
    return {
      method: OMITTED,
      url: OMITTED,
      status: null,
      failed: OMITTED,
      type: OMITTED,
      _orbMeasuredLimit: { policy: limits, events: [{ kind: "unreadable", path: "$", original: null, retained: 0, omitted: null }] },
    };
  }
}
