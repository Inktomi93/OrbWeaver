// The `[trpc]` console channel's one-line formatter, replacing loggerLink's verbose default.
// Inputs are key-scrubbed before they ever reach the console. NOT dev-only: loggerLink fires this in
// prod for errors too, so this module (+ log-clock) ships.

import { logClock } from "./log-clock";

/**
 * The structural slice of tRPC's `LoggerLinkFnOptions` this formatter reads — declared locally
 * (tRPC does not export the fn-options type cleanly) and SUPERTYPE-compatible with the real arg,
 * so `logger: formatTrpcOp` assignability is verified by tsc at the data/trpc.ts wiring site.
 */
export type TrpcOpLogEntry =
  | {
      readonly direction: "up";
      readonly type: "query" | "mutation" | "subscription";
      readonly path: string;
      readonly input: unknown;
    }
  | {
      readonly direction: "down";
      readonly type: "query" | "mutation" | "subscription";
      readonly path: string;
      readonly input: unknown;
      readonly elapsedMs: number;
      readonly result: unknown;
    };

const PREFIX_STYLE = "color:#888;font-weight:bold";
const PATH_STYLE = "color:#06c";
const ERROR_STYLE = "color:#c00;font-weight:bold";
const MUTED_STYLE = "color:#888";

// Mirrors the server logger's redact list (authorization/cookie/token/apiKey/password) plus bare
// `key` (EXACT match, so shapes like `queryKey` stay visible) and `secret`.
const SENSITIVE_KEY_RE = /^key$|authorization|cookie|password|secret|token|api[-_]?key/iu;
const REDACT_DEPTH_MAX = 4;
const INPUT_MAX_CHARS = 120;
const INPUT_TRUNCATE_AT = 117;
const SUMMARY_KEYS_MAX = 4;
const SUMMARY_SCALAR_MAX = 60;

/** Recursive key scrub for the dev log line — `[redacted]` for any SENSITIVE_KEY_RE key. */
function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > REDACT_DEPTH_MAX || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? "[redacted]" : redactSensitive(v, depth + 1);
  }
  return out;
}

function compactJson(value: unknown): string {
  try {
    const str = JSON.stringify(value);
    if (str === undefined) {
      return "";
    }
    return str.length > INPUT_MAX_CHARS ? `${str.slice(0, INPUT_TRUNCATE_AT)}…` : str;
  } catch {
    return "[unserializable]";
  }
}

/** Unwrap the tRPC success envelope (`{ result: { data } }`) without depending on its type. */
function extractData(result: unknown): unknown {
  const inner =
    typeof result === "object" && result !== null && "result" in result
      ? (result as { readonly result: unknown }).result
      : undefined;
  return typeof inner === "object" && inner !== null && "data" in inner
    ? (inner as { readonly data: unknown }).data
    : undefined;
}

function summarizeResult(data: unknown): string {
  if (data === undefined) {
    return "—";
  }
  if (data === null) {
    return "null";
  }
  if (Array.isArray(data)) {
    return `${data.length} ${data.length === 1 ? "row" : "rows"}`;
  }
  if (typeof data === "object") {
    const keys = Object.keys(data);
    return `{${keys.slice(0, SUMMARY_KEYS_MAX).join(",")}${keys.length > SUMMARY_KEYS_MAX ? ",…" : ""}}`;
  }
  return String(data).slice(0, SUMMARY_SCALAR_MAX);
}

/**
 * One informative console line per tRPC op: `→` start (info) · `←` settle with ms + result summary
 * (info) · `✗` error with ms + message (error — red badge in DevTools).
 */
export function formatTrpcOp(entry: TrpcOpLogEntry): void {
  const prefix = `%c${logClock()} [trpc]`;
  if (entry.direction === "up") {
    const inputStr = entry.input === undefined ? "" : compactJson(redactSensitive(entry.input));
    console.info(
      `${prefix} %c→ ${entry.type} ${entry.path}%c ${inputStr}`,
      PREFIX_STYLE,
      PATH_STYLE,
      MUTED_STYLE,
    );
    return;
  }
  const ms = `${Math.round(entry.elapsedMs)}ms`;
  if (entry.result instanceof Error) {
    console.error(
      `${prefix} %c✗ ${entry.type} ${entry.path}%c ${ms} · ${entry.result.message}`,
      PREFIX_STYLE,
      ERROR_STYLE,
      MUTED_STYLE,
    );
    return;
  }
  const summary = summarizeResult(extractData(entry.result));
  console.info(
    `${prefix} %c← ${entry.type} ${entry.path}%c ${ms} · ${summary}`,
    PREFIX_STYLE,
    PATH_STYLE,
    MUTED_STYLE,
  );
}
