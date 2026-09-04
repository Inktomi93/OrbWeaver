// The client→server error-report sink: the browser has no pino, so a render throw the client catches
// needs to land in the same observability surface a server error does. `recordClientError` is a thin
// tagged `getLog().error(...)` call; the log ring already surfaces it via /api/_debug/errors, tagged
// `clientError: true`. Fields are length-capped so a hostile/broken client can't grow an unbounded log
// line, the URL is reduced to origin+path (a query string is where a callback code or invite token rides,
// and the logger's key-based redaction cannot see inside a string), and the correlation id is bounded +
// charset-clamped. `clientRequestId` (never bare `requestId`) avoids overwriting this call's own
// request-scoped binding with the unrelated id of whatever request the client is reporting about.

import { getLog } from "./logger.ts";

const FIELD_MAX = 4000;
/** The correlation id is opaque and short by construction (`X-Request-Id`'s own charset-only validation is
 *  the twin). It had NO cap here at all — the wire procedure's 200 was the only bound, and this sink is
 *  exported and callable from anywhere. */
const REQUEST_ID_MAX = 200;
const REQUEST_ID_UNSAFE = /[^A-Za-z0-9._:-]+/g;

/** One client-reported error. Optional fields degrade the record, never reject it — wire validation
 *  lives in the `clientError` transport procedure, not here. */
export interface ClientErrorReport {
  message: string;
  stack?: string | undefined;
  ownerStack?: string | undefined;
  url: string;
  requestId?: string | undefined;
}

function truncate(value: string): string;
function truncate(value: string | undefined): string | undefined;
function truncate(value: string | undefined): string | undefined {
  if (value === undefined) {
    return value;
  }
  return value.length > FIELD_MAX ? `${value.slice(0, FIELD_MAX)}…` : value;
}

/**
 * Drop the query string and fragment, keeping origin + path. TRUNCATION IS NOT REDACTION: a client error
 * thrown on an OAuth callback or an invite-accept route carries the code/token in `?…`, a short URL never
 * reaches the length cap, and the logger's key-based redaction cannot see inside a URL string. The path is
 * kept because WHICH ROUTE threw is the diagnostic value; anything a route puts in its query is not.
 * Deliberately not `new URL()`: this must be total (the report's `url` may be relative or malformed) and a
 * parser that throws would push the whole record into the caller's catch.
 */
function pathOnly(raw: string): string {
  let end = raw.length;
  for (const mark of ["?", "#"]) {
    const at = raw.indexOf(mark);
    if (at >= 0 && at < end) {
      end = at;
    }
  }
  return raw.slice(0, end);
}

/** Bound + charset-clamp the client's correlation id: it is echoed into a shared log line, so it carries
 *  only the id charset and never an unbounded blob. */
function scrubRequestId(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.replace(REQUEST_ID_UNSAFE, "").slice(0, REQUEST_ID_MAX);
}

/** Record a client-reported error into the same log stream + error ring server errors use. Never throws
 *  — an oversized report degrades (truncates) rather than dropping or crashing the caller. */
export function recordClientError(report: ClientErrorReport): void {
  getLog().error(
    {
      clientError: true,
      url: truncate(pathOnly(report.url)),
      stack: truncate(report.stack),
      ownerStack: truncate(report.ownerStack),
      clientRequestId: scrubRequestId(report.requestId),
    },
    `client error: ${truncate(report.message)}`,
  );
}
