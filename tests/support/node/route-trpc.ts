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
// surface fires never 404s the test. Exemplar usage: tests/client/components/query-boundary.ct.tsx.
//
// …BUT `null` IS NOT A VIEW, AND THAT FAILS SILENTLY (#629). A component that suspends on an unstubbed
// read gets `null` and throws reading it, which its QueryBoundary catches — so the section's BODY is
// replaced by `QueryErrorState` while everything OUTSIDE the boundary (the Section heading the test
// asserts on) still renders. A whole CT file passed for weeks with its subject never rendering.
// The lenient fulfil stays (an incidental query must not 404 a test that has nothing to do with it),
// but it is no longer SILENT: every requested-but-unlisted procedure is warned on stderr once per
// route registration and exposed on the recorder as `unstubbed()`, so a composition-mount CT can
// assert its subject was actually fed — `expect(trpc.unstubbed()).toEqual([])`.
//
// Two responder MARKERS ride alongside plain data/functions: `trpcError(…)` for a scripted failure
// envelope, and `trpcHold()` for a deferred one — a release valve that lets a CT pin a PENDING render
// as a stable state rather than trying to catch a flash. Both are recognised on the value a responder
// PRODUCES, so either works as a route value or as a function's return.

import type { Page, Request } from "@playwright/test";
// The ONE tRPC code union home (tests/support/matchers.ts, derived through classifyDomainError —
// gate no-inline-union-redecl). Type-only: erased, no vitest runtime in the Playwright process.
import type { TrpcErrorCode } from "../matchers.ts";

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
  /** The honest domain reason code the real error formatter rides on `data.reason` (a DomainOperationError's
   *  `.code`) — modelled here so a CT can drive a client mapper that keys on it (e.g. `duplicate_name`). */
  readonly reason?: string;
}

/**
 * Scripted failure sentinel — a responder that returns this gets an ERROR envelope. Fail-then-
 * succeed scripts close over a counter: `echo: () => (n++ === 0 ? trpcError() : data)`. Pass `reason` to
 * model a DomainOperationError's `data.reason` code (the wire field a client inline-error mapper reads).
 */
export function trpcError(opts: { readonly code?: TrpcErrorCode; readonly message?: string; readonly reason?: string } = {}): TrpcErrorMarker {
  return {
    [ERROR_MARK]: true,
    code: opts.code ?? "INTERNAL_SERVER_ERROR",
    message: opts.message ?? "scripted CT failure",
    ...(opts.reason === undefined ? {} : { reason: opts.reason }),
  };
}

function isTrpcError(value: unknown): value is TrpcErrorMarker {
  return typeof value === "object" && value !== null && ERROR_MARK in value;
}

const HOLD_MARK = Symbol("routeTrpc.hold");

interface TrpcHoldMarker {
  readonly [HOLD_MARK]: {
    /** Called the moment the stub intercepts a request carrying this procedure. */
    readonly onRequest: () => void;
    /** Settles with the value `release` was given; the stub awaits it before fulfilling. */
    readonly released: Promise<unknown>;
  };
  /** Resolves once a request carrying this procedure has reached the stub — i.e. the query is in
   *  flight and being held. The deterministic barrier for "assert the pending arm, THEN release":
   *  releasing before the request lands answers it instantly and the pending arm never renders. */
  readonly requested: Promise<void>;
  /** Release the held request with this data — or a `trpcError(…)` marker to release it as a failure.
   *  Calls after the first are ignored (a re-fetch of the same procedure re-uses the settled value). */
  readonly release: (data: unknown) => void;
}

/**
 * A DEFERRED responder — hands the test the release valve for one procedure so a CT can pin a PENDING
 * render as a settled, indefinitely-stable state instead of trying to catch a flash:
 *
 *     const hold = trpcHold();
 *     await routeTrpc(page, { echo: hold, "tag.listTags": [] });
 *     await mount(<Story />);
 *     await hold.requested;                       // the query is in flight, held
 *     await expect(page.getByText("loading…")).toBeVisible();
 *     hold.release({ message: "pong" });          // …and now it settles
 *
 * Usable anywhere a responder is (a route value, or the return of a responder function), because the
 * marker is recognised on the PRODUCED value exactly like `trpcError`.
 *
 * WHAT IT HOLDS IS THE REQUEST, NOT THE PROCEDURE — and it cannot be otherwise. Our client is
 * `httpBatchLink`, deliberately NOT `httpBatchStreamLink` (packages/client/src/data/trpc.ts states why
 * at length), so a batch is ONE HTTP response: there is no wire affordance for answering three of its
 * four entries and leaving the fourth open. A hold therefore suspends every procedure batched WITH it,
 * and releases them together — the envelope stays well-formed and index-aligned, each sibling carrying
 * its own responder's real data. Requests that do not carry the held procedure are untouched. To render
 * a sibling SETTLED beside a held query, keep them out of the same tick (mount the sibling first, await
 * its settled text, then reveal the reader that holds).
 *
 * A hold that is never released simply never answers, and the test fails on its own timeout.
 */
export function trpcHold(): TrpcHoldMarker {
  // `new Promise`'s executor runs SYNCHRONOUSLY, so both handles are assigned before the return below
  // — definite assignment, not a throwaway no-op initialiser that could silently swallow a release.
  let onRequest!: () => void;
  let release!: (data: unknown) => void;
  const requested = new Promise<void>((resolve) => {
    onRequest = resolve;
  });
  const released = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  return { [HOLD_MARK]: { onRequest, released }, requested, release };
}

function isTrpcHold(value: unknown): value is TrpcHoldMarker {
  return typeof value === "object" && value !== null && HOLD_MARK in value;
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
  /**
   * Procedures the mounted tree REQUESTED that this call did not stub, first-seen order (header, #629).
   * They were answered `null`, which is not a view — a suspending reader throws on it and its
   * QueryBoundary swaps the section body for `QueryErrorState` while the heading outside the boundary
   * still renders. A composition-mount CT pins the whole tree was actually fed with
   * `expect(trpc.unstubbed()).toEqual([])`; a CT that deliberately leaves an incidental read unstubbed
   * simply does not call this.
   */
  readonly unstubbed: () => string[];
}

export async function routeTrpc(page: Page, routes: TrpcRoutes): Promise<TrpcRecorder> {
  // THE CENSUS LIVENESS MARKER (#637). The UNSTUBBED lines below are the census's FINDINGS; this line is the
  // proof the census could take one at all. A run that collected nothing because the marker was renamed, the
  // stderr plumbing broke, or this stub was swapped would otherwise be indistinguishable from a clean tree —
  // the blind-gate false clean this repo keeps paying for. The ratchet reds a CT file that ran, calls
  // `routeTrpc(`, and produced no ACTIVE line (tooling/src/verify/ops/ct-unfed-ratchet.ts, blindCensusRefusals).
  // Emitted per REGISTRATION rather than once per worker, because the reporter attributes markers to the
  // currently-running test, and per-file liveness is what the refusal arm needs.
  console.warn("[routeTrpc] ACTIVE");
  const calls = new Map<string, unknown[]>();
  // Requested-but-unlisted procedures, first-seen order. A Set, so a re-fetch warns once.
  const unstubbed = new Set<string>();
  const record = (proc: string, input: unknown): void => {
    const arr = calls.get(proc) ?? [];
    arr.push(input);
    calls.set(proc, arr);
  };
  /** Note a requested procedure that has no route entry (#629). NOT called for the EventSource path: a
   *  subscription is scoped OUT of this stub by design (header) and always answers 204, so counting one as
   *  "unfed" would be the instrument reporting its own documented posture as a finding. */
  const noteUnstubbed = (proc: string): void => {
    if (proc in routes || unstubbed.has(proc)) {
      return;
    }
    unstubbed.add(proc);
    // stderr, never a throw: the lenient fulfil is deliberate (header), so this reports rather than
    // decides. `trpc.unstubbed()` is the arm a test asserts on.
    console.warn(`[routeTrpc] UNSTUBBED ${proc} — answered null, which is not a view (#629)`);
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

    // `await`ed as a whole: a `trpcHold` responder suspends the FULL batch until the test releases it
    // (one HTTP response per batch — see trpcHold's header). Every OTHER entry is produced eagerly here,
    // in call order, so the envelope that eventually lands is well-formed and index-aligned; only its
    // delivery waits. Without the hold arm this stays exactly as synchronous as it was.
    const results = await Promise.all(
      procs.map(async (proc, i) => {
        const input = byIndex[String(i)];
        record(proc, input);
        noteUnstubbed(proc);
        const responder = routes[proc];
        const produced = typeof responder === "function" ? (responder as (x: unknown) => unknown)(input) : responder;
        let data = produced;
        if (isTrpcHold(produced)) {
          produced[HOLD_MARK].onRequest();
          data = await produced[HOLD_MARK].released;
        }
        if (isTrpcError(data)) {
          const errorData = data.reason === undefined ? { code: data.code } : { code: data.code, reason: data.reason };
          return { error: { code: errorNumber(data.code), message: data.message, data: errorData } };
        }
        // `data ?? null`: JSON can't carry undefined; unlisted procedures land here → {data:null}.
        return { result: { data: data ?? null } };
      }),
    );

    await route.fulfill({ json: isBatch ? results : results[0] });
  });

  return {
    inputs: (proc): unknown[] => calls.get(proc) ?? [],
    lastInput: (proc): unknown => (calls.get(proc) ?? []).at(-1),
    count: (proc): number => (calls.get(proc) ?? []).length,
    unstubbed: (): string[] => [...unstubbed],
  };
}
