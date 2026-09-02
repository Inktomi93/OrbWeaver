// The request-log arm's PURE half: the substring filter, the body cap, and the printed block. No
// Playwright, no filesystem — so the accounting a reviewer reads is provable from hand-built entries
// (ops/request-log.ts owns the event wiring).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { RequestBodyOutcome, RequestLogEntry, RequestLogReceipt } from "../contract/request-log.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --requests");

/** One response body, bounded. Large enough for a tRPC payload or an HTML document head, small enough
 *  that a reader is never handed a megabyte of minified bundle — and a cut ALWAYS says where it cut. */
export const REQUEST_BODY_CAP_BYTES = 16_384;
/** Printed rows. The JSON artifact in the run slot is always complete; this only bounds the terminal. */
const REQUEST_LINES_CAP = 200;
const METHOD_PAD = 6;
const TYPE_PAD = 10;
const STATUS_PAD = 3;

/** `--requests [url-substring]`: a plain, case-insensitive substring match on the URL. Deliberately not a
 *  regex — the operator's question is "did this surface hit `trpc`", and a regex dialect here would be a
 *  second selector language to get wrong (lib/selector-shape.ts is the cautionary precedent). */
export function filterRequests(entries: readonly RequestLogEntry[], filter: string | null): readonly RequestLogEntry[] {
  if (filter === null) {
    return entries;
  }
  const needle = filter.toLowerCase();
  return entries.filter((entry) => entry.url.toLowerCase().includes(needle));
}

export function matchesRequestFilter(url: string, filter: string): boolean {
  return url.toLowerCase().includes(filter.toLowerCase());
}

/** Cap a body and account for the cut. `truncatedAt` is the byte offset the text stops at — never a bare
 *  ellipsis, because a reader has to be able to tell a short body from a cut one. */
export function capBody(
  text: string,
  cap: number = REQUEST_BODY_CAP_BYTES,
): { readonly text: string; readonly bytes: number; readonly truncatedAt: number | null } {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= cap) {
    return { text, bytes, truncatedAt: null };
  }
  return { text: Buffer.from(text, "utf8").subarray(0, cap).toString("utf8"), bytes, truncatedAt: cap };
}

function sizeLabel(entry: RequestLogEntry): string {
  return entry.sizeBytes === null ? "size=unknown" : `size=${entry.sizeBytes}`;
}

function timingLabel(entry: RequestLogEntry): string {
  return entry.durationMs === null ? "ms=unfinished" : `ms=${entry.durationMs}`;
}

function requestLine(entry: RequestLogEntry): string {
  const status = entry.failed === null ? String(entry.status ?? "—") : `${entry.status ?? "—"} ${entry.failed}`;
  return `  ${String(entry.index).padStart(STATUS_PAD)} ${entry.method.padEnd(METHOD_PAD)} ${entry.resourceType.padEnd(TYPE_PAD)} ${status.padEnd(STATUS_PAD)} ${sizeLabel(entry)} ${timingLabel(entry)} ${entry.url}`;
}

function bodyLines(body: RequestBodyOutcome): readonly string[] {
  if (body.kind === "no-match") {
    return [`\n--- REQUEST BODY (filter "${body.filter}") ---`, "  no request in this run matched — the filter is a URL SUBSTRING, not a selector"];
  }
  if (body.kind === "error") {
    return [`\n--- REQUEST BODY (${body.url}) ---`, `  the body could not be read: ${body.reason}`];
  }
  const truncation = body.truncatedAt === null ? "complete" : `truncatedAt=${body.truncatedAt}`;
  return [`\n--- REQUEST BODY (${body.url}, bytes=${body.bytes}, ${truncation}) ---`, body.text];
}

/** The block the operator reads: the denominator, the filtered rows, and the one body if asked. */
export function requestLogLines(receipt: RequestLogReceipt): readonly string[] {
  const scope = receipt.filter === null ? "no filter" : `filter "${receipt.filter}"`;
  const lines = [`\n--- REQUESTS (${receipt.shown.length} of ${receipt.total}, ${scope}) ---`];
  for (const entry of receipt.shown.slice(0, REQUEST_LINES_CAP)) {
    lines.push(requestLine(entry));
  }
  if (receipt.shown.length > REQUEST_LINES_CAP) {
    lines.push(`  … +${receipt.shown.length - REQUEST_LINES_CAP} more — the complete log is in ${receipt.jsonPath}`);
  }
  lines.push(`  log          ${receipt.jsonPath}`);
  if (receipt.body !== null) {
    lines.push(...bodyLines(receipt.body));
  }
  return lines;
}
