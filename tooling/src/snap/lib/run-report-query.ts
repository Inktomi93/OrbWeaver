// Pure argv/query and row-filter logic for Snap's browser-free run-index reader.

import { scopeMatches } from "../../_shared/artifact-scope.ts";
import type { DiskSafeBrowserDiagnostic } from "../contract/browser-evidence-redaction.ts";
import type { SnapCompositeFinding, SnapReportQuery, SnapRunArtifact, SnapRunListQuery } from "../contract/run-index.ts";

interface ReportParseState {
  mode: SnapReportQuery["mode"];
  explicitMode: string | null;
  level: SnapReportQuery["level"];
  arm: string | null;
  channel: string | null;
  source: string | null;
  category: string | null;
  text: string | null;
  page: number | null;
  context: number | null;
  window: string | null;
}

const REPORT_LEVELS = ["error", "warning", "info", "verbose"] as const satisfies readonly NonNullable<SnapReportQuery["level"]>[];

function reportArm(value: string | null): string | null {
  return value === "perf" ? "interaction-perf" : value;
}

/** `--channel console` is the spelling every printed reader command uses and the word an operator has in
 *  mind; `browser-diagnostics` is the channel the writer stamps. Normalized ONCE here so the finding,
 *  diagnostic and artifact filters cannot drift apart on it. */
function reportChannel(value: string | null): string | null {
  return value === "console" ? "browser-diagnostics" : value;
}

function takeValue(flag: string, rest: string[], errors: string[]): string | null {
  const value = rest[0];
  if (value === undefined || value === "" || value.startsWith("--")) {
    errors.push(`${flag} requires a non-empty value`);
    return null;
  }
  return rest.shift() ?? null;
}

function parseModeFilter(flag: string, state: ReportParseState, errors: string[]): boolean {
  if (flag !== "--all" && flag !== "--problems") {
    return false;
  }
  if (state.explicitMode !== null) {
    errors.push(`${state.explicitMode} and ${flag} are mutually exclusive`);
  }
  state.explicitMode = flag;
  state.mode = flag === "--all" ? "all" : "problems";
  return true;
}

function parseLevelFilter(flag: string, rest: string[], state: ReportParseState, errors: string[]): boolean {
  if (flag !== "--level") {
    return false;
  }
  const value = rest[0];
  const level = REPORT_LEVELS.find((candidate) => candidate === value);
  if (value === undefined || value.startsWith("--") || level === undefined) {
    errors.push(`--level expects error|warning|info|verbose, got ${value ?? "(missing)"}`);
  } else {
    rest.shift();
    state.level = level;
  }
  return true;
}

function parseStringFilter(flag: string, rest: string[], state: ReportParseState, errors: string[]): boolean {
  if (flag === "--arm") {
    state.arm = reportArm(takeValue(flag, rest, errors));
    return true;
  }
  if (flag === "--channel") {
    state.channel = reportChannel(takeValue(flag, rest, errors));
    return true;
  }
  if (flag === "--source") {
    state.source = takeValue(flag, rest, errors);
    return true;
  }
  if (flag === "--category") {
    state.category = takeValue(flag, rest, errors);
    return true;
  }
  if (flag === "--text") {
    state.text = takeValue(flag, rest, errors);
    return true;
  }
  return false;
}

function parseIdentityFilter(flag: string, rest: string[], state: ReportParseState, errors: string[]): boolean {
  if (flag === "--page" || flag === "--context") {
    const next = rest[0];
    const raw = next === undefined || next.startsWith("--") ? undefined : rest.shift();
    const value = raw === undefined ? Number.NaN : Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`${flag} expects a non-negative integer, got ${raw ?? "(missing)"}`);
    } else if (flag === "--page") {
      state.page = value;
    } else {
      state.context = value;
    }
    return true;
  }
  if (flag === "--window") {
    state.window = takeValue(flag, rest, errors);
    return true;
  }
  return false;
}

function parseReportFilter(flag: string, rest: string[], state: ReportParseState, errors: string[]): void {
  if (
    parseModeFilter(flag, state, errors) ||
    parseLevelFilter(flag, rest, state, errors) ||
    parseStringFilter(flag, rest, state, errors) ||
    parseIdentityFilter(flag, rest, state, errors)
  ) {
    return;
  }
  errors.push(`unknown report flag ${flag}`);
}

/** `--reports [--last N] [--lane <x>]`. Unknown flags still REFUSE by name: the list used to accept
 *  nothing at all, and silently ignoring a filter would print a full window that reads as a filtered one. */
function takeWindow(rest: string[], errors: string[]): number | null {
  const raw = rest[0] === undefined || rest[0].startsWith("--") ? undefined : rest.shift();
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  errors.push(`--last expects a positive integer, got ${raw ?? "(missing)"}`);
  return null;
}

function parseRunListArgs(rest: string[], errors: string[]): SnapRunListQuery {
  const query = { last: null as number | null, lane: null as string | null };
  while (rest.length > 0) {
    const flag = rest.shift();
    if (flag === "--last") {
      query.last = takeWindow(rest, errors);
    } else if (flag === "--lane") {
      query.lane = takeValue(flag, rest, errors);
    } else if (flag !== undefined) {
      errors.push(`unknown --reports flag ${flag} (accepted: --last N, --lane <name>)`);
    }
  }
  return query;
}

export function parseSnapReportArgs(argv: readonly string[]): {
  readonly query: SnapReportQuery | null;
  readonly list: SnapRunListQuery | null;
  readonly errors: readonly string[];
} {
  if (!(argv.includes("--report") || argv.includes("--reports"))) {
    return { query: null, list: null, errors: [] };
  }
  const rest = [...argv];
  const errors: string[] = [];
  if (rest[0] === "--reports") {
    rest.shift();
    return { query: null, list: parseRunListArgs(rest, errors), errors };
  }
  if (rest.shift() !== "--report") {
    return { query: null, list: null, errors: ["--report must be the first argument in browser-free report mode"] };
  }
  const target = rest.shift();
  if (target === undefined || target.startsWith("--")) {
    return { query: null, list: null, errors: ["--report requires <absolute-index|exact-run-id|latest>"] };
  }
  const state: ReportParseState = {
    mode: "problems",
    explicitMode: null,
    level: null,
    arm: null,
    channel: null,
    source: null,
    category: null,
    text: null,
    page: null,
    context: null,
    window: null,
  };
  while (rest.length > 0) {
    const flag = rest.shift();
    if (flag !== undefined) {
      parseReportFilter(flag, rest, state, errors);
    }
  }
  const { explicitMode: _explicitMode, ...query } = state;
  return { query: { target, ...query }, list: null, errors };
}

export function diagnosticMatches(row: DiskSafeBrowserDiagnostic, query: SnapReportQuery): boolean {
  return (
    (query.channel === null || query.channel === "browser-diagnostics") &&
    (query.level === null || row.level === query.level) &&
    (query.source === null || row.source === query.source) &&
    (query.category === null || row.category === query.category) &&
    (query.text === null || row.text.toLowerCase().includes(query.text.toLowerCase())) &&
    (query.page === null || row.pageIndex === query.page) &&
    (query.context === null || row.contextIndex === query.context) &&
    (query.window === null || String(row.evidenceWindow) === query.window) &&
    (query.mode === "all" || row.level === "error" || row.level === "warning")
  );
}

export function artifactMatches(artifact: SnapRunArtifact, query: SnapReportQuery): boolean {
  return (
    (query.arm === null || artifact.producerArm === query.arm || artifact.producer.includes(query.arm) || artifact.relativePath.includes(query.arm)) &&
    (query.channel === null ||
      artifact.channel === query.channel ||
      artifact.producer === query.channel ||
      artifact.relativePath.startsWith(`${query.channel}/`)) &&
    scopeMatches(artifact.scope, query)
  );
}

export function findingMatches(finding: SnapCompositeFinding, query: SnapReportQuery): boolean {
  const text = [finding.what, finding.where, ...finding.conflicts].join(" ").toLowerCase();
  return (
    (query.arm === null || finding.arms.some((arm) => arm === query.arm)) &&
    (query.channel === null || finding.channels.includes(query.channel)) &&
    (query.source === null || finding.evidence.some((row) => row.source === query.source)) &&
    (query.text === null || text.includes(query.text.toLowerCase())) &&
    (query.level === null || finding.severity === query.level) &&
    ((query.page === null && query.context === null && query.window === null) || finding.evidence.some((row) => scopeMatches(row.scope, query)))
  );
}
