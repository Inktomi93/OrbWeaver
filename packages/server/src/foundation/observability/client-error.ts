// foundation/observability/client-error — the client→server error-report SINK (PD-58: the browser has
// no pino; a render throw the client catches needs to land in the SAME observability surface a server
// error does). `recordClientError` is a thin tagged `getLog().error(...)` call — the log ring is already
// fed by the pino `ringStream` multistream destination (logger.ts), so no new ring/table is needed;
// `/api/_debug/errors` (which filters the log ring at level >= error, debug/routes.ts `collectErrors`)
// surfaces client errors for free, tagged `clientError: true` so an operator can grep/filter them apart
// from server-thrown errors. The transport verb (`transport/trpc/router.ts` `clientError` procedure) is
// the only caller; it validates + bounds the wire payload, this sink bounds the LOG LINE independently
// (defense in depth for any future internal caller that bypasses the zod schema).
//
// Fields are defensively length-capped — a hostile or badly-broken client can't grow an unbounded log
// line (mirrors the `MAX_ATTR_LEN`/`INPUT_MAX_CHARS` truncation precedent elsewhere in observability:
// tracing.ts's span-attribute cap, trpc-devlog.ts's console-line cap). `clientRequestId` (never bare
// `requestId`) is the field name for the client-supplied correlation id: `getLog()` already binds THIS
// call's own request-scoped `requestId` via `logger.child()` (the request that carried the report) —
// reusing the bare key would silently overwrite that binding with the (unrelated) id of whatever earlier
// request the client is reporting about, breaking `/api/_debug/logs?requestId=` correlation for the
// report call itself.

import { getLog } from "./logger";

const FIELD_MAX = 4000;

/** One client-reported error. Optional fields degrade the record, never reject it — the (permissive)
 *  wire validation lives in the `clientError` transport procedure, not here. */
export interface ClientErrorReport {
  message: string;
  // `exactOptionalPropertyTypes` is on — zod's `.optional()` output type is `string | undefined`, so the
  // caller's (router.ts's) parsed-input object shape matches ONLY when the union includes `undefined`
  // explicitly (a bare `stack?: string` forbids an explicit `undefined` value, not just an absent key).
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
 * Record a client-reported error into the SAME log stream + error ring server errors use. Never throws —
 * an oversized report degrades (truncates) rather than dropping or crashing the caller (the transport
 * procedure fires this then returns `{ ok: true }` unconditionally, matching `logAudit`'s "the report
 * channel must never break the caller" discipline).
 */
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
