import { print } from "../../_shared/artifacts.ts";
import type { BrowserDiagnostic, DiagnosticLevel } from "../../_shared/browser-diagnostics.ts";
import { DIAGNOSTIC_LEVELS } from "../../_shared/browser-diagnostics.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DiagnosticQuery } from "../contract/diagnostics.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --diagnostics <query> <route>");

const QUERY_KEYS = new Set(["level", "source", "category", "text", "page", "window"]);
const REPORT_CAP = 200;

function parseFields(value: string, errors: string[]): Map<string, string> {
  const fields = new Map<string, string>();
  if (value === "all") {
    return fields;
  }
  for (const part of value.split(",")) {
    const at = part.indexOf("=");
    const key = at < 0 ? part : part.slice(0, at);
    const fieldValue = at < 0 ? "" : part.slice(at + 1);
    if (!QUERY_KEYS.has(key) || fieldValue === "") {
      errors.push(`--diagnostics query member ${JSON.stringify(part)} must be key=value (${[...QUERY_KEYS].join("|")})`);
    } else if (fields.has(key)) {
      errors.push(`--diagnostics query repeats ${key}; one value per field`);
    } else {
      fields.set(key, fieldValue);
    }
  }
  return fields;
}

function parseLevel(value: string | undefined, errors: string[]): DiagnosticLevel | null {
  if (value === undefined) {
    return null;
  }
  const level = DIAGNOSTIC_LEVELS.find((candidate) => candidate === value);
  if (level === undefined) {
    errors.push(`--diagnostics level must be verbose|info|warning|error, got ${JSON.stringify(value)}`);
    return null;
  }
  return level;
}

function parseIndex(value: string | undefined, errors: string[]): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    errors.push(`--diagnostics page must be a zero-based integer, got ${JSON.stringify(value)}`);
    return null;
  }
  return parsed;
}

function parseWindow(value: string | undefined, errors: string[]): "current" | number | null {
  if (value === undefined) {
    return null;
  }
  if (value === "current") {
    return value;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    errors.push(`--diagnostics window must be current or a non-negative integer, got ${JSON.stringify(value)}`);
    return null;
  }
  return parsed;
}

export function parseDiagnosticQuery(value: string): { readonly query: DiagnosticQuery; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const fields = parseFields(value, errors);
  return {
    query: {
      level: parseLevel(fields.get("level"), errors),
      source: fields.get("source") ?? null,
      category: fields.get("category") ?? null,
      text: fields.get("text") ?? null,
      page: parseIndex(fields.get("page"), errors),
      window: parseWindow(fields.get("window"), errors),
    },
    errors,
  };
}

function matches(entry: BrowserDiagnostic, query: DiagnosticQuery, currentWindow: number): boolean {
  const window = query.window === "current" ? currentWindow : query.window;
  return (
    (query.level === null || entry.level === query.level) &&
    (query.source === null || entry.source === query.source) &&
    (query.category === null || entry.category === query.category) &&
    (query.text === null || entry.text.toLowerCase().includes(query.text.toLowerCase())) &&
    (query.page === null || entry.pageIndex === query.page) &&
    (window === null || entry.evidenceWindow === window)
  );
}

function presentationFingerprint(entry: BrowserDiagnostic): string {
  // Presentation alone dedupes cross-source overlaps: page/CDP records arrive first and win; the later
  // app-ring mirror remains lossless in JSON/session evidence but does not print the same failure twice.
  return JSON.stringify([entry.level, entry.text, entry.location?.url, entry.location?.line, entry.contextIndex, entry.pageIndex, entry.evidenceWindow]);
}

export function queryDiagnostics(raw: readonly BrowserDiagnostic[], query: DiagnosticQuery, currentWindow: number): readonly BrowserDiagnostic[] {
  const fingerprints = new Set<string>();
  return raw
    .filter((entry) => matches(entry, query, currentWindow))
    .filter((entry) => {
      const fingerprint = presentationFingerprint(entry);
      if (fingerprints.has(fingerprint)) {
        return false;
      }
      fingerprints.add(fingerprint);
      return true;
    });
}

export function printDiagnosticQuery(raw: readonly BrowserDiagnostic[], query: DiagnosticQuery | null, currentWindow: number): void {
  if (query === null) {
    return;
  }
  const selected = queryDiagnostics(raw, query, currentWindow);
  print(`diagnostic query  matched=${selected.length} raw=${raw.length} window=${currentWindow}`);
  for (const entry of selected.slice(0, REPORT_CAP)) {
    const location = entry.location === null ? "" : ` ${entry.location.url}:${entry.location.line}:${entry.location.column ?? 0}`;
    print(
      `  [${entry.level}] ${entry.source}/${entry.category ?? "uncategorized"} c${entry.contextIndex}p${entry.pageIndex}w${entry.evidenceWindow}${location} — ${entry.text}`,
    );
  }
  if (selected.length > REPORT_CAP) {
    print(`  … ${selected.length - REPORT_CAP} more diagnostic record(s); --json is lossless`);
  }
}
