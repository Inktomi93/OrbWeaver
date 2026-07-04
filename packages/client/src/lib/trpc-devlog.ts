// The `[trpc]` console channel's ONE-LINE formatter (UI-Arch §2.1 lib/: display util) — replaces
// loggerLink's verbose `>> << Object` default. Wired by data/trpc.ts into the query/mutation link
// branch ONLY (subscriptions bypass the logger there — per-delta spam would bury the console).
// Line shapes (wall-clock prefixed via logClock so probe/console-capture transcripts carry timing):
//   [trpc] → query character.get {"characterId":"c-…"}
//   [trpc] ← query character.get 14ms · 1 row
//   [trpc] ✗ query chat.send 5142ms · DomainNoCredentialError: …
// Inputs are key-scrubbed BEFORE they reach the console (neo V9-5: the dev logger printed
// credentials.add's plaintext `key`) — bare `key` matches EXACTLY so shapes like `queryKey` stay
// visible; the rest match as substrings (accessToken, clientSecret, …). NOT dev-only by design:
// the loggerLink `enabled` fn fires this in prod for ERRORS, so this module (+ log-clock) ships;
// the strip-verified dev-only modules are dev-tools.tsx / long-task-tracer.ts.

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

// %c console styles (colorMode 'css' — the loggerLink option data/trpc.ts sets; these are DevTools
// console styling strings, not UI theme values — the token gates cover feature/ui TSX).
const PREFIX_STYLE = "color:#888;font-weight:bold";
const PATH_STYLE = "color:#06c";
const ERROR_STYLE = "color:#c00;font-weight:bold";
const MUTED_STYLE = "color:#888";

// Secret-ish input keys, scrubbed before the input ever reaches the console. Mirrors the server
// logger's redact list (authorization/cookie/token/apiKey/password) plus bare `key` (the
// credentials.add field, EXACT match) and `secret`.
const SENSITIVE_KEY_RE = /^key$|authorization|cookie|password|secret|token|api[-_]?key/iu;
// Log inputs are small and redaction runs only when the link actually logs — a shallow depth cap
// keeps the scrub cheap and cycle-safe.
const REDACT_DEPTH_MAX = 4;
// One line means COMPACT: inputs truncate at 120 chars (117 + the ellipsis run).
const INPUT_MAX_CHARS = 120;
const INPUT_TRUNCATE_AT = 117;
// Result summaries: at most 4 object keys / 60 scalar chars.
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
