#!/usr/bin/env tsx
/**
 * pnpm trace:render [<file> | -]
 *
 * Pure renderer: read a `RequestTrace` JSON from stdin or a file path, print a colored
 * ASCII waterfall to stdout.
 *
 *   curl -s http://127.0.0.1:8788/api/_debug/traces/<rid> | pnpm trace:render
 *
 * Exported `renderTrace()` is reused by trace-tail.ts + probe-fire.ts so all three
 * surfaces print identical shapes.
 *
 * `RequestTrace`/`SerializedSpan` are TYPE-ONLY imports from
 * `@orb/server/foundation/observability` — erased at runtime, and a server-side shape
 * change fails `tsc` here instead of silently desyncing the renderer.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { RequestTrace, SerializedSpan } from "@orb/server/foundation/observability";

export type { RequestTrace, SerializedSpan } from "@orb/server/foundation/observability";

/** db spans at/over this duration get a red ⚠ in the waterfall. Override: SLOW_DB_MS=250. */
const DEFAULT_SLOW_DB_MS = 100;
// biome-ignore lint/style/noProcessEnv: SLOW_DB_MS is a probe-render knob (the red-flag threshold for slow db spans) — ambient tooling env, not app config; probes run outside the foundation/env perimeter.
const SLOW_DB_MS = Number(process.env["SLOW_DB_MS"] ?? DEFAULT_SLOW_DB_MS);

const tty = process.stdout.isTTY === true;
const identity = (s: string): string => s;
const ANSI = {
  bold: tty ? (s: string): string => `\x1b[1m${s}\x1b[0m` : identity,
  dim: tty ? (s: string): string => `\x1b[2m${s}\x1b[0m` : identity,
  red: tty ? (s: string): string => `\x1b[31m${s}\x1b[0m` : identity,
  green: tty ? (s: string): string => `\x1b[32m${s}\x1b[0m` : identity,
  yellow: tty ? (s: string): string => `\x1b[33m${s}\x1b[0m` : identity,
  blue: tty ? (s: string): string => `\x1b[34m${s}\x1b[0m` : identity,
  magenta: tty ? (s: string): string => `\x1b[35m${s}\x1b[0m` : identity,
  cyan: tty ? (s: string): string => `\x1b[36m${s}\x1b[0m` : identity,
};

// Per-kind colour — matches the span-naming contract (foundation/observability/tracing.ts).
function colorFor(name: string, status: SerializedSpan["status"]): (s: string) => string {
  if (status === "error") {
    return ANSI.red;
  }
  if (name.startsWith("db.")) {
    return ANSI.cyan;
  }
  if (name.startsWith("provider.")) {
    return ANSI.magenta;
  }
  if (name.startsWith("trpc.")) {
    return ANSI.blue;
  }
  if (name.startsWith("credentials.")) {
    return ANSI.yellow;
  }
  if (name.startsWith("chat.")) {
    return ANSI.green;
  }
  if (name.startsWith("http ")) {
    return ANSI.bold;
  }
  return identity;
}

type WaterfallRow = {
  readonly span: SerializedSpan;
  readonly depth: number;
};

/** Build depth-first ordered rows so visual order matches "what happened next." */
function buildRows(trace: RequestTrace): WaterfallRow[] {
  const byParent = new Map<string | undefined, SerializedSpan[]>();
  for (const s of trace.spans) {
    const list = byParent.get(s.parentSpanId) ?? [];
    list.push(s);
    byParent.set(s.parentSpanId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.startedAt - b.startedAt);
  }
  const out: WaterfallRow[] = [];
  const visit = (parentId: string | undefined, depth: number): void => {
    for (const s of byParent.get(parentId) ?? []) {
      out.push({ span: s, depth });
      visit(s.spanId, depth + 1);
    }
  };
  visit(undefined, 0);
  return out;
}

const LABEL_COLS = 48;
const MS_PAD = 6;
const BAR_MIN = 20;
const BAR_MAX = 60;
const FALLBACK_COLS = 100;
const MIN_COLS = 60;
const ATTR_VALUE_MAX = 40;

/**
 * The waterfall printer. Each row: `<status> <name> <ms> <bar>  <selected attrs>`.
 *
 *   ● http POST /api/trpc/chat.send             32ms ████████████████  path=/api/trpc/chat.send
 *   ●   trpc.chat.send                          31ms  ███████████████  type=mutation
 *   ●     db.execute                             1ms  ▒                sql=SELECT…
 *
 * Bar offset ∝ (span.startedAt − root.startedAt) / root.durationMs; width ∝
 * span.durationMs / root.durationMs. A 0-duration span keeps a single tick.
 */
export function renderTrace(trace: RequestTrace): string {
  const rows = buildRows(trace);
  const cols = Math.max(MIN_COLS, process.stdout.columns ?? FALLBACK_COLS);
  const barCols = Math.max(BAR_MIN, Math.min(BAR_MAX, cols - MIN_COLS));
  const totalMs = Math.max(trace.durationMs, 1);
  const lines: string[] = [];

  const statusBadge = trace.status === "error" ? ANSI.red("✗ error") : ANSI.green("● ok");
  lines.push(
    `${ANSI.bold(trace.rootName)}  ${statusBadge}  ${Math.round(trace.durationMs)}ms  ${ANSI.dim(
      `req ${trace.requestId}`,
    )}`,
  );
  lines.push(
    ANSI.dim(
      `  ${trace.totals.spanCount} spans · ${trace.totals.dbSpanCount}db (${Math.round(trace.totals.dbDurationMs)}ms) · provider ${Math.round(trace.totals.providerDurationMs)}ms`,
    ),
  );
  lines.push("");

  for (const row of rows) {
    lines.push(renderRow(row, trace, totalMs, barCols));
  }
  return lines.join("\n");
}

function renderRow(
  row: WaterfallRow,
  trace: RequestTrace,
  totalMs: number,
  barCols: number,
): string {
  const indent = "  ".repeat(row.depth);
  const color = colorFor(row.span.name, row.span.status);
  const label = `${row.span.status === "error" ? ANSI.red("✗") : color("●")} ${indent}${color(row.span.name)}`;
  const slow = row.span.name.startsWith("db.") && row.span.durationMs >= SLOW_DB_MS;
  const msRaw = `${Math.round(row.span.durationMs)}ms`.padStart(MS_PAD);
  const ms = slow ? ANSI.red(`${msRaw} ⚠`) : msRaw;
  const offsetCol = Math.round(((row.span.startedAt - trace.startedAt) / totalMs) * barCols);
  const widthCol = Math.max(1, Math.round((row.span.durationMs / totalMs) * barCols));
  const left = Math.min(Math.max(0, offsetCol), barCols - 1);
  const width = Math.min(widthCol, barCols - left);
  const bar =
    ANSI.dim("░".repeat(left)) +
    color("█".repeat(width)) +
    ANSI.dim("░".repeat(Math.max(0, barCols - left - width)));

  const attrs = pickInlineAttrs(row.span);
  const attrLine = attrs.length > 0 ? `  ${ANSI.dim(attrs.join(" "))}` : "";

  const labelTruncated = truncate(label, LABEL_COLS);
  const ansiOverhead = label.length - stripAnsi(label).length;
  return `${labelTruncated.padEnd(LABEL_COLS + ansiOverhead, " ")} ${ms}  ${bar}${attrLine}`;
}

// The most diagnostic attribute keys, in the order worth reading inline; everything
// else stays in the raw JSON.
const INLINE_ATTR_PRIORITY = [
  "trpc.errorCode",
  "db.sql",
  "db.rows",
  "db.rowsAffected",
  "db.batch.size",
  "http.path",
  "trpc.type",
  "chat.intent",
  "chat.model",
  "provider.model",
  "turn.tokensIn",
  "turn.tokensOut",
  "turn.costUsd",
  "turn.finishReason",
] as const;

function pickInlineAttrs(span: SerializedSpan): string[] {
  const out: string[] = [];
  for (const key of INLINE_ATTR_PRIORITY) {
    const value = span.attributes[key];
    if (value === undefined) {
      continue;
    }
    const v = typeof value === "string" ? truncate(value, ATTR_VALUE_MAX) : String(value);
    out.push(`${key.split(".").pop()}=${v}`);
  }
  return out;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences ARE control chars — stripping them is this regex's whole job.
const ANSI_RE = /\x1b\[[0-9;]*m/gu;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function truncate(s: string, max: number): string {
  const visible = stripAnsi(s);
  if (visible.length <= max) {
    return s;
  }
  return `${visible.slice(0, max - 1)}…`;
}

// ── CLI: read JSON from stdin (default) or a file ───────────────────────────

const EXIT_USAGE = 2;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  let raw: string;
  if (arg === undefined || arg === "-") {
    if (process.stdin.isTTY === true) {
      process.stderr.write("usage: pnpm trace:render <file>  |  curl … | pnpm trace:render\n");
      process.exit(EXIT_USAGE);
    }
    raw = await readStdin();
  } else {
    raw = readFileSync(arg, "utf-8");
  }
  const parsed: unknown = JSON.parse(raw);
  // Accept both a bare trace and a `{traces: [...]}` list response — the list endpoint
  // strips `spans` (summary rows); only a full trace renders a waterfall.
  if (parsed !== null && typeof parsed === "object" && "spans" in parsed) {
    process.stdout.write(`${renderTrace(parsed as RequestTrace)}\n`);
    return;
  }
  if (parsed !== null && typeof parsed === "object" && "traces" in parsed) {
    const list = (parsed as { traces: RequestTrace[] }).traces;
    for (const t of list) {
      if (Array.isArray(t.spans)) {
        process.stdout.write(`${renderTrace(t)}\n\n`);
      } else {
        process.stdout.write(
          `${t.rootName}  ${t.status}  ${Math.round(t.durationMs)}ms  req ${t.requestId}  (summary row — fetch /api/_debug/traces/${t.requestId} for the waterfall)\n`,
        );
      }
    }
    return;
  }
  process.stderr.write("trace-render: input doesn't look like a RequestTrace or a traces list\n");
  process.exit(1);
}

// Only run main when invoked as a script (not when imported by trace-tail/probe-fire/tests).
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
