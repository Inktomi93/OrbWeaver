// routeTrpc — the tRPC network stub for Playwright CT (core/Spine-Testing.md §7). CT runs the test
// in NODE and the component in the BROWSER, so node-side closures (vi.fn / MSW handlers) can never
// run in the page — interception happens at the network boundary via `page.route`, which IS
// node-side: it fulfills responses AND records decoded inputs (the spy replacement).
//
// Wire shapes (verified against @trpc/client 11.18.0 source; no transformer → identity JSON):
//   • httpBatchLink (OUR client — packages/client/src/data/trpc.ts splitLink false-branch):
//     `?batch=1`, path = comma-joined procs. QUERY inputs ride the URL (`&input={"0":…}`,
//     index-keyed) even when batched (httpUtils.ts getUrl); MUTATION inputs are the index-keyed
//     POST body. Response = an ARRAY of envelopes (httpBatchLink.ts `Array.isArray(res.json)`).
//   • httpLink (non-batched — tolerated so link-composition drift can't break CT): one proc in the
//     path, GET `?input=<json>` / POST raw-input body; response = ONE envelope.
//   • envelopes (@trpc/server rpc/envelopes.ts + transformResult): success `{result:{data}}`
//     (`type` optional); error `{error:{code:<JSONRPC NUMBER>,message,data}}` — `code` MUST be
//     numeric or the client throws TransformResultError. The client ignores HTTP status (it parses
//     the envelope), so everything fulfills 200.
//   • subscriptions (httpSubscriptionLink / EventSource): OUT OF SCOPE — recorded, then 204. A
//     component that subscribes needs an SSE helper (rides with the chat-surface lane).
//
// Unlisted procedures resolve `{result:{data:null}}` AND are recorded, so an incidental query a
// surface fires never 404s the test. Exemplar usage: tests/client/data/query-boundary.ct.tsx.

import type { Page, Request } from "@playwright/test";
// The ONE tRPC code union home (tests/support/matchers.ts, derived through classifyDomainError —
// gate no-inline-union-redecl). Type-only: erased, no vitest runtime in the Playwright process.
import type { TrpcErrorCode } from "../matchers";

/** A response: static data, or a function of the decoded input (return `trpcError(…)` to fail). */
export type TrpcResponder = unknown | ((input: unknown) => unknown);
export type TrpcRoutes = Record<string, TrpcResponder>;

/** tRPC code → JSONRPC number (@trpc/server rpc/codes.ts TRPC_ERROR_CODES_BY_KEY), exhaustive. */
function errorNumber(code: TrpcErrorCode): number {
  switch (code) {
    case "PARSE_ERROR":
      return -32_700;
    case "BAD_REQUEST":
      return -32_600;
    case "INTERNAL_SERVER_ERROR":
    case "NOT_IMPLEMENTED":
    case "BAD_GATEWAY":
    case "SERVICE_UNAVAILABLE":
    case "GATEWAY_TIMEOUT":
      return -32_603;
    case "UNAUTHORIZED":
      return -32_001;
    case "PAYMENT_REQUIRED":
      return -32_002;
    case "FORBIDDEN":
      return -32_003;
    case "NOT_FOUND":
      return -32_004;
    case "METHOD_NOT_SUPPORTED":
      return -32_005;
    case "TIMEOUT":
      return -32_008;
    case "CONFLICT":
      return -32_009;
    case "PRECONDITION_FAILED":
      return -32_012;
    case "PAYLOAD_TOO_LARGE":
      return -32_013;
    case "UNSUPPORTED_MEDIA_TYPE":
      return -32_015;
    case "UNPROCESSABLE_CONTENT":
      return -32_022;
    case "PRECONDITION_REQUIRED":
      return -32_028;
    case "TOO_MANY_REQUESTS":
      return -32_029;
    case "CLIENT_CLOSED_REQUEST":
      return -32_099;
  }
}

const ERROR_MARK = Symbol("routeTrpc.error");

interface TrpcErrorMarker {
  readonly [ERROR_MARK]: true;
  readonly code: TrpcErrorCode;
  readonly message: string;
}

/**
 * Scripted failure sentinel — a responder that returns this gets an ERROR envelope. Fail-then-
 * succeed scripts close over a counter: `echo: () => (n++ === 0 ? trpcError() : data)`.
 */
export function trpcError(opts: { readonly code?: TrpcErrorCode; readonly message?: string } = {}): TrpcErrorMarker {
  return {
    [ERROR_MARK]: true,
    code: opts.code ?? "INTERNAL_SERVER_ERROR",
    message: opts.message ?? "scripted CT failure",
  };
}

function isTrpcError(value: unknown): value is TrpcErrorMarker {
  return typeof value === "object" && value !== null && ERROR_MARK in value;
}

// Inputs: queries carry `?input=` (batched or not — getUrl always URL-encodes query input);
// mutations carry the POST body. Batched payloads are index-keyed (`{"0":…}`); non-batched carry
// the raw input, normalized to index "0".
function decodeInputs(req: Request, url: URL, isBatch: boolean): Record<string, unknown> {
  let raw: unknown;
  const inputParam = url.searchParams.get("input");
  if (inputParam !== null) {
    raw = JSON.parse(inputParam);
  } else if (req.method() !== "GET") {
    try {
      raw = req.postDataJSON();
    } catch {
      raw = undefined;
    }
  }
  return isBatch ? ((raw as Record<string, unknown>) ?? {}) : { 0: raw };
}

export interface TrpcRecorder {
  /** Decoded inputs recorded per procedure, in call order. */
  readonly inputs: (proc: string) => unknown[];
  /** The most recent decoded input for a procedure (or undefined). */
  readonly lastInput: (proc: string) => unknown;
  /** How many times a procedure was called. */
  readonly count: (proc: string) => number;
}

export async function routeTrpc(page: Page, routes: TrpcRoutes): Promise<TrpcRecorder> {
  const calls = new Map<string, unknown[]>();
  const record = (proc: string, input: unknown): void => {
    const arr = calls.get(proc) ?? [];
    arr.push(input);
    calls.set(proc, arr);
  };

  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isBatch = url.searchParams.get("batch") === "1";
    // Batched requests comma-join the procedures into the path; non-batched is one proc.
    const procs = decodeURIComponent(url.pathname.split("/api/trpc/")[1] ?? "").split(",");
    const byIndex = decodeInputs(req, url, isBatch);

    // EventSource subscription — scoped out (header): record the call, answer 204 no-content.
    const accept = req.headers()["accept"] ?? "";
    if (accept.includes("text/event-stream")) {
      for (const [i, proc] of procs.entries()) {
        record(proc, byIndex[String(i)]);
      }
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    const results = procs.map((proc, i) => {
      const input = byIndex[String(i)];
      record(proc, input);
      const responder = routes[proc];
      const data = typeof responder === "function" ? (responder as (x: unknown) => unknown)(input) : responder;
      if (isTrpcError(data)) {
        return {
          error: { code: errorNumber(data.code), message: data.message, data: { code: data.code } },
        };
      }
      // `data ?? null`: JSON can't carry undefined; unlisted procedures land here → {data:null}.
      return { result: { data: data ?? null } };
    });

    await route.fulfill({ json: isBatch ? results : results[0] });
  });

  return {
    inputs: (proc): unknown[] => calls.get(proc) ?? [],
    lastInput: (proc): unknown => (calls.get(proc) ?? []).at(-1),
    count: (proc): number => (calls.get(proc) ?? []).length,
  };
}
