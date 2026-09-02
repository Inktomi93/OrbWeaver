// The `--requests` / `--request-body` arm's shapes — what this run's page ACTUALLY asked the network
// for, in order (docs/design/1195-devtools-mcp-retirement.md §2 item 2, replacing the retired MCP's
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
  /** The response's declared `content-length`. NULL means the response never declared one (a streamed or
   *  chunked body) — never 0, which would read as an empty payload. */
  readonly sizeBytes: number | null;
  /** Request start → responseEnd, ms. Null when the request never finished inside the run. */
  readonly durationMs: number | null;
}

/** `--request-body <url-substring>`: exactly one body, capped and accounted. Three honest outcomes — a
 *  filter that matched nothing is a real answer about the page, not an error. */
export type RequestBodyOutcome =
  | {
      readonly kind: "captured";
      readonly url: string;
      readonly bytes: number;
      /** Byte offset the text was cut at, or null when the whole body is here. */
      readonly truncatedAt: number | null;
      readonly text: string;
    }
  | { readonly kind: "no-match"; readonly filter: string }
  | { readonly kind: "error"; readonly filter: string; readonly url: string; readonly reason: string };

export interface RequestLogReceipt {
  /** Every request the run recorded, before `--requests <filter>` narrowed it — the denominator. */
  readonly total: number;
  readonly filter: string | null;
  readonly shown: readonly RequestLogEntry[];
  readonly body: RequestBodyOutcome | null;
  readonly jsonPath: string;
}
