// The client→server error-report sink: the browser has no pino, so a render throw the client catches
// needs to land in the same observability surface a server error does. `recordClientError` is a thin
// tagged `getLog().error(...)` call; the log ring already surfaces it via /api/_debug/errors, tagged
// `clientError: true`. Fields are length-capped so a hostile/broken client can't grow an unbounded log
// line. `clientRequestId` (never bare `requestId`) avoids overwriting this call's own request-scoped
// binding with the unrelated id of whatever request the client is reporting about.

import { getLog } from "./logger.ts";

const FIELD_MAX = 4000;

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

/** Record a client-reported error into the same log stream + error ring server errors use. Never throws
 *  — an oversized report degrades (truncates) rather than dropping or crashing the caller. */
export function recordClientError(report: ClientErrorReport): void {
  getLog().error(
    {
      clientError: true,
      url: truncate(report.url),
      stack: truncate(report.stack),
      ownerStack: truncate(report.ownerStack),
      clientRequestId: report.requestId,
    },
    `client error: ${truncate(report.message)}`,
  );
}
