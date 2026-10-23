// Typed tRPC network fixtures for Playwright CT; request inputs remain unvalidated wire observations.
// Missing responders fail the owning test automatically, even when a mounted surface handles the network error.
// Subscriptions require an explicit terminal responder or their own SSE helper.

import type { AppRouter } from "@orb/server";
import type { Page, Request } from "@playwright/test";
import { expect } from "@playwright/test";
import type { TrpcWire } from "../iso/trpc-wire.ts";
// The ONE tRPC code union home (tests/support/node/matchers.ts, derived through classifyDomainError —
// gate no-inline-union-redecl). Type-only: erased, no vitest runtime in the Playwright process.
import type { TrpcErrorCode } from "./matchers.ts";

type AppRouterRecord = AppRouter["_def"]["record"];

interface AppProcedureShape {
  readonly _def: {
    readonly procedure: true;
    readonly $types: { readonly input: unknown; readonly output: unknown };
  };
}

type ProcedurePath<TRecord> = {
  [K in keyof TRecord & string]: TRecord[K] extends AppProcedureShape
    ? K
    : TRecord[K] extends Record<string, unknown>
      ? `${K}.${ProcedurePath<TRecord[K]>}`
      : never;
}[keyof TRecord & string];

type ProcedureAtPath<TRecord, TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
  ? Head extends keyof TRecord
    ? ProcedureAtPath<TRecord[Head], Tail>
    : never
  : TPath extends keyof TRecord
    ? TRecord[TPath]
    : never;

/** Every procedure name accepted by the canonical AppRouter wire contract. */
export type TrpcProcedurePath = ProcedurePath<AppRouterRecord>;

type AppProcedure<TPath extends TrpcProcedurePath> = Extract<ProcedureAtPath<AppRouterRecord, TPath>, AppProcedureShape>;

type AppProcedureOutput<TPath extends TrpcProcedurePath> = AppProcedure<TPath>["_def"]["$types"]["output"];
type TrpcFullSuccess<TPath extends TrpcProcedurePath> = TrpcWire<AppProcedureOutput<TPath>> | (undefined extends AppProcedureOutput<TPath> ? null : never);

/** The JSON-facing success shape for one procedure, with compile-time-only ID brands erased. */
export type TrpcWireOutput<TPath extends TrpcProcedurePath> = TrpcFullSuccess<TPath>;

type TrpcRawInput<TPath extends TrpcProcedurePath> = AppProcedure<TPath>["_def"]["$types"]["input"];
/** The canonical decoded input accepted by one AppRouter procedure. */
export type TrpcInput<TPath extends TrpcProcedurePath> = undefined extends TrpcRawInput<TPath> ? undefined | TrpcRawInput<TPath> : TrpcRawInput<TPath>;

/** A response for one AppRouter procedure: the full wire output, or a marker. */
type CanonicalTrpcResponder<TPath extends TrpcProcedurePath> =
  | TrpcFullSuccess<TPath>
  | TrpcMarker<TPath>
  | ((input: TrpcInput<TPath>) => TrpcFullSuccess<TPath> | TrpcMarker<TPath>);

/**
 * Procedure-keyed helper map. Name a path union for a reusable map with required, contract-checked keys;
 * the default is the broad optional composition shape and is deliberately rejected as a direct route map.
 */
export type TrpcRoutes<TPaths extends TrpcProcedurePath = never> = [TPaths] extends [never]
  ? { [TPath in TrpcProcedurePath]?: CanonicalTrpcResponder<TPath> }
  : { [TPath in TPaths]-?: CanonicalTrpcResponder<TPath> };

type MatchingWireMember<TActual, TExpected> = TActual extends unknown
  ? TExpected extends unknown
    ? TActual extends string | number | boolean | bigint | symbol | null | undefined
      ? TActual extends TExpected
        ? TActual
        : never
      : TActual extends readonly (infer TActualItem)[]
        ? TExpected extends readonly (infer TExpectedItem)[]
          ? [TActualItem] extends [never]
            ? TActual
            : ExactWire<TActualItem, TExpectedItem> extends never
              ? never
              : TActual
          : never
        : TActual extends object
          ? TExpected extends object
            ? ExactObject<TActual, TExpected> extends never
              ? never
              : TActual
            : never
          : never
    : never
  : never;

type ExactWire<TActual, TExpected> = unknown extends TActual
  ? never
  : unknown extends TExpected
    ? TActual
    : [TActual] extends [MatchingWireMember<TActual, TExpected>]
      ? TActual
      : never;

type InvalidFixedObjectKeys<TActual extends object, TExpected extends object> = {
  [K in keyof TActual]-?: K extends keyof TExpected ? (ExactWire<TActual[K], TExpected[K]> extends never ? K : never) : K;
}[keyof TActual];

type InvalidDictionaryKeys<TActual extends object, TExpected extends object> = {
  [K in keyof TActual]-?: K extends string | number ? (ExactWire<TActual[K], TExpected[string & keyof TExpected]> extends never ? K : never) : K;
}[keyof TActual];

type ExactObject<TActual extends object, TExpected extends object> = keyof TActual extends never
  ? Record<never, never> extends TExpected
    ? TActual
    : never
  : string extends keyof TExpected
    ? InvalidDictionaryKeys<TActual, TExpected> extends never
      ? TActual
      : never
    : string extends keyof TActual
      ? never
      : InvalidFixedObjectKeys<TActual, TExpected> extends never
        ? TActual
        : never;

type TrpcMarker<TPath extends TrpcProcedurePath> =
  | TrpcErrorMarker
  | TrpcHoldMarker
  | TrpcWireEscapeMarker
  | (AppProcedure<TPath> extends { readonly _def: { readonly type: "subscription" } } ? TrpcSubscriptionEndMarker : never);
type MatchingProduced<TPath extends TrpcProcedurePath, TProduced> =
  TProduced extends TrpcMarker<TPath> ? TProduced : ExactWire<TProduced, TrpcWireOutput<TPath>>;
type ExactArrayProduced<TPath extends TrpcProcedurePath, TProduced> = TProduced extends readonly (infer TActualItem)[]
  ? Extract<TrpcWireOutput<TPath>, readonly unknown[]> extends readonly (infer TExpectedItem)[]
    ? [TActualItem] extends [TExpectedItem]
      ? [TExpectedItem] extends [TActualItem]
        ? TProduced
        : never
      : never
    : never
  : never;
type FullProduced<TPath extends TrpcProcedurePath, TProduced> = [TProduced] extends [TrpcWireOutput<TPath> | TrpcMarker<TPath>]
  ? [TProduced] extends [MatchingProduced<TPath, TProduced>]
    ? TProduced
    : never
  : never;
type ExactProduced<TPath extends TrpcProcedurePath, TProduced> =
  ExactArrayProduced<TPath, TProduced> extends never
    ? TrpcWireOutput<TPath> extends TProduced
      ? TProduced extends TrpcWireOutput<TPath>
        ? TProduced
        : FullProduced<TPath, TProduced>
      : FullProduced<TPath, TProduced>
    : TProduced;

type ResponderInputAccepts<TPath extends TrpcProcedurePath, Args extends readonly unknown[]> = Args["length"] extends 0
  ? true
  : number extends Args["length"]
    ? true
    : TrpcInput<TPath> extends Args[0]
      ? true
      : false;

type ExactResponder<TPath extends TrpcProcedurePath, TResponder> =
  CanonicalTrpcResponder<TPath> extends TResponder
    ? TResponder extends CanonicalTrpcResponder<TPath>
      ? TResponder
      : never
    : TResponder extends (...args: infer Args) => infer Produced
      ? ResponderInputAccepts<TPath, Args> extends true
        ? ExactProduced<TPath, Produced> extends never
          ? never
          : TResponder
        : never
      : ExactProduced<TPath, TResponder> extends never
        ? never
        : TResponder;

type RequiredRouteKeys<TRoutes> = {
  [TPath in keyof TRoutes]-?: object extends Pick<TRoutes, TPath> ? never : TPath;
}[keyof TRoutes];

type ExactRoutes<TRoutes extends object> = string extends keyof TRoutes
  ? never
  : keyof TRoutes extends never
    ? TRoutes
    : RequiredRouteKeys<TRoutes> extends never
      ? never
      : { readonly [TPath in RequiredRouteKeys<TRoutes>]: TPath extends TrpcProcedurePath ? ExactResponder<TPath, TRoutes[TPath]> : never };

type ContextualObject<T extends object> = {
  readonly [K in keyof T]?: T[K] extends string | number | boolean | bigint | symbol | null | undefined ? T[K] : unknown;
};

type ContextualOutput<T> = T extends readonly (infer Item)[]
  ? readonly (Item extends object ? ContextualObject<Item> : Item)[]
  : T extends object
    ? ContextualObject<T>
    : T;

/**
 * Give inline responder parameters and top-level discriminants their canonical context without recursively
 * instantiating the full output graph. `ExactRoutes` below remains the complete output validator. The bounded
 * context avoids expanding recursive plugin nodes and large mutually assignable view unions twice per route.
 */
type ContextualResponder<TPath extends TrpcProcedurePath> =
  | ContextualOutput<TrpcFullSuccess<TPath>>
  | TrpcMarker<TPath>
  | ((input: TrpcInput<TPath>) => ContextualOutput<TrpcFullSuccess<TPath>> | TrpcMarker<TPath>);

type ContextualRoutes<TRoutes extends object> = {
  readonly [TPath in keyof TRoutes]: TPath extends TrpcProcedurePath ? ContextualResponder<TPath> : never;
};

/** Validate a fixture map against the procedure-specific AppRouter input and output types. */
export function defineTrpcRoutes<const TRoutes extends object>(routes: TRoutes & ContextualRoutes<NoInfer<TRoutes>> & ExactRoutes<NoInfer<TRoutes>>): TRoutes {
  return routes;
}

/** tRPC code → JSONRPC number (`@trpc/server` rpc/codes.ts TRPC_ERROR_CODES_BY_KEY), exhaustive. */
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
  /** The refusal's stated facts the formatter rides on `data.detail` (a DomainOperationError's `.detail`). */
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Scripted failure sentinel — a responder that returns this gets an ERROR envelope. Fail-then-
 * succeed scripts close over a counter: `echo: () => (n++ === 0 ? trpcError() : data)`. Pass `reason` to
 * model a DomainOperationError's `data.reason` code (the wire field a client inline-error mapper reads).
 */
export function trpcError(
  opts: {
    readonly code?: TrpcErrorCode;
    readonly message?: string;
    readonly reason?: string;
    readonly detail?: Readonly<Record<string, string | number | boolean>>;
  } = {},
): TrpcErrorMarker {
  return {
    [ERROR_MARK]: true,
    code: opts.code ?? "INTERNAL_SERVER_ERROR",
    message: opts.message ?? "scripted CT failure",
    ...(opts.reason === undefined ? {} : { reason: opts.reason }),
    ...(opts.detail === undefined ? {} : { detail: opts.detail }),
  };
}

/** A scripted failure as the real error formatter puts it on the wire. */
function errorEnvelope(marker: TrpcErrorMarker): { readonly error: { readonly code: number; readonly message: string; readonly data: object } } {
  const data = {
    code: marker.code,
    ...(marker.reason === undefined ? {} : { reason: marker.reason }),
    ...(marker.detail === undefined ? {} : { detail: marker.detail }),
  };
  return { error: { code: errorNumber(marker.code), message: marker.message, data } };
}

function isTrpcError(value: unknown): value is TrpcErrorMarker {
  return typeof value === "object" && value !== null && ERROR_MARK in value;
}

const HOLD_MARK = Symbol("routeTrpc.hold");

/** What `release` accepts for one procedure: its full wire output, or a failure marker. A hold that names no
 *  procedure (`trpcHold()`, `TPath` = `never`) releases nothing, so a held response can never be a subset. */
type TrpcHoldRelease<TPath extends TrpcProcedurePath | undefined> = TPath extends TrpcProcedurePath ? TrpcWireOutput<TPath> | TrpcErrorMarker : never;

interface TrpcHoldMarker<TPath extends TrpcProcedurePath | undefined = undefined> {
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
  readonly release: (data: TrpcHoldRelease<TPath>) => void;
}

/**
 * A DEFERRED responder — hands the test the release valve for one procedure so a CT can pin a PENDING
 * render as a settled, indefinitely-stable state instead of trying to catch a flash:
 *
 * ```ts
 *     const hold = trpcHold<"echo">();
 *     await routeTrpc(page, { echo: hold, "tag.listTags": [] });
 *     await mount(<Story />);
 *     await hold.requested;                       // the query is in flight, held
 *     await expect(page.getByText("loading…")).toBeVisible();
 *     hold.release({ message: "pong" });          // …and now it settles
 * ```
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
export function trpcHold<TPath extends TrpcProcedurePath = never>(): TrpcHoldMarker<TPath> {
  // `new Promise`'s executor runs SYNCHRONOUSLY, so both handles are assigned before the return below
  // — definite assignment, not a throwaway no-op initialiser that could silently swallow a release.
  const { promise: requested, resolve: onRequest } = Promise.withResolvers<void>();
  const { promise: released, resolve: release } = Promise.withResolvers<unknown>();
  return { [HOLD_MARK]: { onRequest, released }, requested, release };
}

function isTrpcHold(value: unknown): value is TrpcHoldMarker {
  return typeof value === "object" && value !== null && HOLD_MARK in value;
}

const SUBSCRIPTION_END_MARK = Symbol("routeTrpc.subscription-end");

interface TrpcSubscriptionEndMarker {
  readonly [SUBSCRIPTION_END_MARK]: true;
}

/** Explicitly terminate one declared subscription with HTTP 204, without fabricating stream events. */
export function trpcEndSubscription(): TrpcSubscriptionEndMarker {
  return { [SUBSCRIPTION_END_MARK]: true };
}

function isTrpcSubscriptionEnd(value: unknown): value is TrpcSubscriptionEndMarker {
  return typeof value === "object" && value !== null && SUBSCRIPTION_END_MARK in value;
}

const WIRE_ESCAPE_MARK = Symbol("routeTrpc.malformed-or-forward-wire");

interface TrpcWireEscapeMarker {
  readonly [WIRE_ESCAPE_MARK]: unknown;
}

/**
 * Explicit escape for a test whose subject is malformed or forward-version wire data that the current
 * AppRouter cannot emit. Ordinary fixture drift must be repaired against the canonical procedure output.
 */
export function malformedOrForwardTrpcWire(value: unknown): TrpcWireEscapeMarker {
  return { [WIRE_ESCAPE_MARK]: value };
}

function unwrapTrpcWireEscape(value: unknown): unknown {
  return typeof value === "object" && value !== null && WIRE_ESCAPE_MARK in value ? value[WIRE_ESCAPE_MARK] : value;
}

// Inputs: queries carry `?input=` (batched or not — getUrl always URL-encodes query input);
// mutations and subscriptions carry the POST body. Batched payloads are index-keyed (`{"0":…}`); non-batched carry
// the raw input, normalized to index "0".
function decodeInputs(req: Request, url: URL, isBatch: boolean): object {
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
  if (!isBatch) {
    return { 0: raw };
  }
  return typeof raw === "object" && raw !== null ? raw : {};
}

export interface TrpcRecorder {
  /** Unvalidated, unnormalized request JSON correlated by AppRouter procedure path; never server-parsed input. */
  readonly inputs: <P extends TrpcProcedurePath>(proc: P) => TrpcInput<P>[];
  /** The most recent decoded input for a procedure (or undefined). */
  readonly lastInput: <P extends TrpcProcedurePath>(proc: P) => TrpcInput<P> | undefined;
  /** {@link TrpcRecorder.lastInput} for a call the test already knows happened: throws when none was recorded.
   *  Playwright's `expect.poll` does NOT retry a throwing callback, so use it only after the call is known to have
   *  landed (a settled count poll, a web-first barrier): inside a poll it fails the test on the first attempt if the
   *  call is still in flight. */
  readonly requireLastInput: <P extends TrpcProcedurePath>(proc: P) => TrpcInput<P>;
  /** How many times a procedure was called. */
  readonly count: (proc: TrpcProcedurePath) => number;
}

export async function routeTrpc<const TRoutes extends object>(
  page: Page,
  routes: TRoutes & ContextualRoutes<NoInfer<TRoutes>> & ExactRoutes<NoInfer<TRoutes>>,
): Promise<TrpcRecorder> {
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

    for (const [index, proc] of procs.entries()) {
      record(proc, Reflect.get(byIndex, String(index)));
    }
    const missing = procs.filter((proc) => !Object.hasOwn(routes, proc));
    expect.soft(missing, `routeTrpc: unhandled procedures: ${missing.join(", ")}`).toEqual([]);
    if (missing.length > 0) {
      await route.abort("failed");
      return;
    }
    const responses = procs.map((proc, index) => {
      const responder: unknown = Reflect.get(routes, proc);
      const input: unknown = Reflect.get(byIndex, String(index));
      return typeof responder === "function" ? Reflect.apply(responder, undefined, [input]) : responder;
    });
    const accept = req.headers()["accept"] ?? "";
    const isSubscription = accept.includes("text/event-stream");
    const subscriptionHandled = !isSubscription || responses.every(isTrpcSubscriptionEnd);
    expect.soft(subscriptionHandled, "routeTrpc: subscriptions require trpcEndSubscription() or an SSE helper").toBe(true);
    if (isSubscription) {
      if (subscriptionHandled) {
        await route.fulfill({ status: 204, body: "" });
      } else {
        await route.abort("failed");
      }
      return;
    }

    // `await`ed as a whole: a `trpcHold` responder suspends the FULL batch until the test releases it
    // (one HTTP response per batch — see trpcHold's header). Every OTHER entry is produced eagerly here,
    // in call order, so the envelope that eventually lands is well-formed and index-aligned; only its
    // delivery waits. Without the hold arm this stays exactly as synchronous as it was.
    const results = await Promise.all(
      responses.map(async (produced) => {
        let data = produced;
        if (isTrpcHold(produced)) {
          produced[HOLD_MARK].onRequest();
          data = await produced[HOLD_MARK].released;
        }
        data = unwrapTrpcWireEscape(data);
        if (isTrpcError(data)) {
          return errorEnvelope(data);
        }
        // A declared void-returning procedure has no JSON undefined representation.
        return { result: { data: data ?? null } };
      }),
    );

    await route.fulfill({ json: isBatch ? results : results[0] });
  });

  return {
    // These observations preserve client bytes, including malformed inputs; parsing would add defaults or transform them.
    inputs: <P extends TrpcProcedurePath>(proc: P): TrpcInput<P>[] => (calls.get(proc) ?? []) as TrpcInput<P>[],
    lastInput: <P extends TrpcProcedurePath>(proc: P): TrpcInput<P> | undefined => (calls.get(proc) ?? []).at(-1) as TrpcInput<P> | undefined,
    requireLastInput: <P extends TrpcProcedurePath>(proc: P): TrpcInput<P> => {
      const recorded = calls.get(proc) ?? [];
      if (recorded.length === 0) {
        throw new Error(`routeTrpc: ${proc} has not been called`);
      }
      return recorded.at(-1) as TrpcInput<P>;
    },
    count: (proc): number => (calls.get(proc) ?? []).length,
  };
}
