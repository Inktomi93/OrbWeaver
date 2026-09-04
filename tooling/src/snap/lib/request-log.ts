// The request-log arm's PURE half: the substring filter and the bounded-ring receipt block. No
// Playwright, no filesystem — so the accounting a reviewer reads is provable from hand-built entries
// (ops/request-log.ts owns the event wiring).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { RequestBodyOutcome, RequestLogEntry, RequestLogReceipt } from "../contract/request-log.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --requests");

export const REQUEST_RING_CAPACITY = 4096;
export const REQUEST_BODY_CAP_BYTES = 262_144;
export const REQUEST_BODY_BUDGET_BYTES = 33_554_432;
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

function sizeLabel(entry: RequestLogEntry): string {
  return entry.sizes === null ? "size=unknown" : `size=${entry.sizes.responseBodySize}`;
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
  if (body.kind === "not-retained") {
    const size = body.bytes === null ? "unknown" : String(body.bytes);
    return [
      `\n--- REQUEST BODY (${body.url}) ---`,
      `  BODY NOT RETAINED reason=${body.reason} content-type=${body.contentType ?? "unknown"} bytes=${size} ` +
        `entry-cap=${body.bodyCapBytes} aggregate=${body.bodyRetainedBytes}/${body.bodyBudgetBytes}`,
    ];
  }
  return [`\n--- REQUEST BODY (${body.url}, bytes=${body.bytes}, content-type=${body.contentType}, complete) ---`, body.text];
}

/** The block the operator reads: the denominator, the filtered rows, and the one body if asked. */
export function requestLogLines(receipt: RequestLogReceipt): readonly string[] {
  const scope = receipt.filter === null ? "no filter" : `filter "${receipt.filter}"`;
  const lines = [
    `\n--- REQUESTS (${receipt.shown.length} of ${receipt.total}, ${scope}) ---`,
    `  window       [${receipt.window.start},${receipt.window.end}) retained-start=${receipt.window.retainedStart} evicted=${receipt.window.evicted}`,
    `  ring         retained=${receipt.ring.retained}/${receipt.ring.capacity} seen=${receipt.ring.seen} evicted=${receipt.ring.evicted}`,
    `  body-budget  retained=${receipt.ring.bodyRetainedBytes}/${receipt.ring.bodyBudgetBytes} ` +
      `captured=${receipt.ring.bodiesCaptured} not-retained=${Object.values(receipt.ring.bodiesNotRetained).reduce((sum, count) => sum + count, 0)}`,
  ];
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
