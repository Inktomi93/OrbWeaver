// The `--requests` / `--request-body` arm's shapes — what this run's page ACTUALLY asked the network
// for, in order (replacing the retired MCP's
// `list_network_requests` / `get_network_request`).
//
// This is deliberately a SECOND, ordered log rather than a widening of `_shared/browser-capture.ts`'s
// `CapturedRequest` map: that map is keyed by URL because its job is the failed-request verdict (one
// entry per URL is exactly right there), and a request LOG must keep every attempt in issue order — a
// surface that re-reads the same tRPC route twice is the question this arm exists to answer.

export interface RequestLogEntry {
  /** Issue order across the whole run, starting at 0 — the sequence IS evidence. */
  readonly index: number;
  readonly method: string;
  readonly url: string;
  /** Playwright's resourceType (document/xhr/fetch/stylesheet/script/image/…). */
  readonly resourceType: string;
  readonly status: number | null;
  readonly failed: string | null;
  /** Playwright's measured wire sizes. Null until/unless a response was observed and `sizes()` resolved. */
  readonly sizes: RequestSizesEvidence | null;
  /** Request start → responseEnd, ms. Null when the request never finished inside the run. */
  readonly durationMs: number | null;
}

export interface RequestSizesEvidence {
  readonly requestBodySize: number;
  readonly requestHeadersSize: number;
  readonly responseBodySize: number;
  readonly responseHeadersSize: number;
}

const REQUEST_BODY_RETENTION_REASONS = ["ineligible-content-type", "over-entry-cap", "over-aggregate-budget", "evicted-before-read", "read-error"] as const;

export type RequestBodyRetentionReason = (typeof REQUEST_BODY_RETENTION_REASONS)[number];

/** `--request-body <url-substring>`: exactly one whole eligible JSON body, or an accounted reason it was
 *  not retained. A filter that matched nothing is a real answer about the page, not an error. */
export type RequestBodyOutcome =
  | {
      readonly kind: "captured";
      readonly url: string;
      readonly bytes: number;
      readonly contentType: string;
      readonly text: string;
    }
  | {
      readonly kind: "not-retained";
      readonly url: string;
      readonly reason: RequestBodyRetentionReason;
      readonly contentType: string | null;
      readonly bytes: number | null;
      readonly bodyCapBytes: number;
      readonly bodyBudgetBytes: number;
      readonly bodyRetainedBytes: number;
    }
  | { readonly kind: "no-match"; readonly filter: string }
  | { readonly kind: "error"; readonly filter: string; readonly url: string; readonly reason: string };

export interface RequestWindowReceipt {
  readonly start: number;
  readonly end: number;
  readonly retainedStart: number;
  /** Rows observed in this window but no longer retained because the lifetime ring wrapped. */
  readonly evicted: number;
}

export interface RequestRingReceipt {
  readonly capacity: number;
  readonly seen: number;
  readonly retained: number;
  readonly evicted: number;
  readonly bodyCapBytes: number;
  readonly bodyBudgetBytes: number;
  readonly bodyRetainedBytes: number;
  readonly bodiesCaptured: number;
  readonly bodiesNotRetained: Readonly<Record<RequestBodyRetentionReason, number>>;
}

export interface RequestLogReceipt {
  /** Every request observed in the checkpoint window, including explicitly-receipted evictions. */
  readonly total: number;
  readonly filter: string | null;
  readonly shown: readonly RequestLogEntry[];
  readonly body: RequestBodyOutcome | null;
  readonly window: RequestWindowReceipt;
  readonly ring: RequestRingReceipt;
  readonly jsonPath: string;
}
