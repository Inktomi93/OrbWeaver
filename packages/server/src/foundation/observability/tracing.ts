// OTel spans + the per-requestId trace ring + the libSQL driver wrap. One root span per request → a tree
// of child spans. On request end the tree seals into a bounded ring the /api/_debug/traces surface reads.
// We run the OTel SDK, not the collector stack: a custom SpanProcessor (RingExporter) pushes finished
// spans into the in-memory ring — the OTLP-replaceable seam. Spans are metadata only; RP content never
// reaches a span attribute.
//
// ASSUMES(single-replica): the trace ring is module-scope, per-process.

import type { Span, SpanOptions, Tracer } from "@opentelemetry/api";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { ReadableSpan, SpanExporter, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { errorMessage } from "@orb/kit/error-message";
import { versionIdentity } from "#foundation/version";
import { getLog } from "./logger.ts";

const TRACER_NAME = "orbweaver";
// The attribute the root span stamps + child spans copy down so the ring buckets a whole tree together.
const REQUEST_ID_ATTR = "orb.requestId";
const REQUEST_TRACE_CAPACITY = 500;
// Hard cap on UNSEALED (in-progress) buckets — bounds the pathological cases where a root NEVER lands (a
// post-request fire-and-forget span copying an already-sealed parent's request id; detached work whose
// root errored before emitting). Over cap → drop the oldest in-progress bucket (leaked by definition).
const MAX_LIVE_BUCKETS = 2000;
// A bounded per-attribute string cap. RP content never reaches an attribute; this is belt-and-braces for a
// developer-added attribute that might accidentally carry a large string (e.g. a SQL fragment).
const MAX_ATTR_LEN = 512;
const MS_PER_SEC = 1000;
const NS_PER_MS = 1e6;

/** Public span shape — the JSON /api/_debug/traces returns. */
export interface SerializedSpan {
  spanId: string;
  parentSpanId: string | undefined;
  name: string;
  startedAt: number;
  durationMs: number;
  status: "ok" | "error";
  attributes: Record<string, string | number | boolean>;
  events: SerializedSpanEvent[];
  /** Set on the root span only; mirrors the request id for client filtering. */
  requestId: string;
}

/** A span event — `attributes` omitted entirely when there are none (exactOptionalPropertyTypes). */
export interface SerializedSpanEvent {
  name: string;
  at: number;
  attributes?: Record<string, string | number | boolean>;
}

/** Precomputed per-trace totals so the list view need not walk every span. */
export interface RequestTraceTotals {
  spanCount: number;
  dbSpanCount: number;
  dbDurationMs: number;
  /** Sum of durations for spans named "provider.*" (the chat runners). */
  providerDurationMs: number;
}

/** A full request trace — the root + its descendants in capture order. */
export interface RequestTrace {
  requestId: string;
  startedAt: number;
  durationMs: number;
  rootName: string;
  status: "ok" | "error";
  spans: SerializedSpan[];
  totals: RequestTraceTotals;
}

interface BucketState {
  spans: SerializedSpan[];
  startedAtMin: number;
}

/** Attributes a span may carry. Primitives only — anything else is a code smell (RP content via a span
 *  attribute is the regression to guard). An index-signature interface (not a `type` alias) so the
 *  no-inline-types grit leaves it (only exported `type`/zod-schema are matched). */
export interface SpanAttrs {
  [key: string]: string | number | boolean | undefined;
}

/** Per-requestId ring of completed traces. Each finished span appends into a transient bucket keyed by the
 *  root's request id; once the root closes, the bucket seals into a RequestTrace + pushes into this ring. */
class TraceRing {
  private readonly traces: (RequestTrace | undefined)[];
  private readonly cap: number;
  private head = 0;
  private size = 0;
  /** Active (not-yet-sealed) buckets — Map preserves insertion order so the first key is the oldest live
   *  bucket (the eviction victim on a MAX_LIVE_BUCKETS breach). */
  private readonly buckets = new Map<string, BucketState>();
  /** Bounded FIFO of recently-sealed requestIds — a span arriving AFTER its root sealed (a post-request
   *  fire-and-forget span) is dropped rather than re-opening a never-evicting bucket. */
  private readonly sealed = new Set<string>();
  /** Reverse lookup so a finished trace can be GET'd by its requestId. */
  private readonly byRequestId = new Map<string, RequestTrace>();

  constructor(cap: number) {
    this.cap = cap;
    this.traces = new Array<RequestTrace | undefined>(cap);
  }

  ingest(readable: ReadableSpan): void {
    // The root carries the request-id attribute; children inherit through the bucket they land in.
    const requestId = readable.attributes[REQUEST_ID_ATTR];
    if (typeof requestId !== "string" || requestId.length === 0) {
      return;
    }
    const bucket = this.bucketFor(requestId);
    if (bucket === undefined) {
      return;
    }
    const serialized = serializeSpan(readable, requestId);
    bucket.spans.push(serialized);
    bucket.startedAtMin = Math.min(bucket.startedAtMin, serialized.startedAt);
    // The root span has no parent. Once it lands the whole tree is settled (OTel ends a parent after its
    // descendants since user code holds the parent open while children run).
    if (serialized.parentSpanId === undefined) {
      this.seal(requestId, bucket, serialized);
    }
  }

  /** Resolve (or create) the live bucket for a requestId; `undefined` = drop this span (late orphan). */
  private bucketFor(requestId: string): BucketState | undefined {
    const existing = this.buckets.get(requestId);
    if (existing !== undefined) {
      return existing;
    }
    // Drop late orphans: a span for an already-sealed request must NOT re-create a bucket (it would never
    // get a root + never evict). The trace is already in the ring.
    if (this.sealed.has(requestId)) {
      return;
    }
    const bucket: BucketState = { spans: [], startedAtMin: Number.POSITIVE_INFINITY };
    this.buckets.set(requestId, bucket);
    // Bound live buckets: a new one over cap evicts the OLDEST in-progress bucket (Map insertion order →
    // first key) — leaked by definition (no root is coming).
    if (this.buckets.size > MAX_LIVE_BUCKETS) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined && oldest !== requestId) {
        this.buckets.delete(oldest);
      }
    }
    return bucket;
  }

  private seal(requestId: string, bucket: BucketState, root: SerializedSpan): void {
    // Sort by startedAt so the waterfall renders chronologically regardless of processor arrival order.
    bucket.spans.sort((a, b) => a.startedAt - b.startedAt || a.spanId.localeCompare(b.spanId));
    const dbSpans = bucket.spans.filter((s) => s.name.startsWith("db."));
    const providerSpans = bucket.spans.filter((s) => s.name.startsWith("provider."));
    const record: RequestTrace = {
      requestId,
      startedAt: root.startedAt,
      durationMs: root.durationMs,
      rootName: root.name,
      status: root.status,
      spans: bucket.spans,
      totals: {
        spanCount: bucket.spans.length,
        dbSpanCount: dbSpans.length,
        dbDurationMs: dbSpans.reduce((s, x) => s + x.durationMs, 0),
        providerDurationMs: providerSpans.reduce((s, x) => s + x.durationMs, 0),
      },
    };
    // Evict the requestId of the record we are about to OVERWRITE at `head` (the slot being reused) — read
    // the OUTGOING record at `head` first, else a full ring leaves the overwritten trace listed in
    // byRequestId while the genuinely-evicted one 404s.
    const evicted = this.traces[this.head];
    if (evicted !== undefined && evicted.requestId !== requestId) {
      this.byRequestId.delete(evicted.requestId);
    }
    this.traces[this.head] = record;
    this.head = (this.head + 1) % this.cap;
    this.size = Math.min(this.size + 1, this.cap);
    this.byRequestId.set(requestId, record);
    this.buckets.delete(requestId);
    // Mark sealed so late orphan spans get dropped rather than re-opening a never-evicting bucket. Bounded
    // to the ring's capacity — once a requestId ages out, dropping late spans for it no longer matters.
    this.sealed.add(requestId);
    if (this.sealed.size > this.cap) {
      const oldest = this.sealed.keys().next().value;
      if (oldest !== undefined) {
        this.sealed.delete(oldest);
      }
    }
  }

  recent(limit: number): RequestTrace[] {
    const out: RequestTrace[] = [];
    const n = Math.min(limit, this.size);
    for (let i = 1; i <= n; i += 1) {
      const record = this.traces[(this.head - i + this.cap) % this.cap];
      if (record !== undefined) {
        out.push(record);
      }
    }
    return out;
  }

  get(requestId: string): RequestTrace | undefined {
    return this.byRequestId.get(requestId);
  }
}

const traceRing = new TraceRing(REQUEST_TRACE_CAPACITY);

/** SpanProcessor that hands every finished span to the ring. The exporter is unused (we store the data
 *  structurally) — an OTLP exporter is the future-replaceable seam. */
class RingExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: { code: number }) => void): void {
    for (const readable of spans) {
      traceRing.ingest(readable);
    }
    resultCallback({ code: 0 });
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

let booted = false;
let tracer: Tracer | undefined;
let processor: SpanProcessor | undefined;

/** Initialize the OTel SDK. Called at boot BEFORE any code opens a span. Idempotent (a second call is a
 *  no-op — tests import freely without re-bootstrapping). Wired from `entry/`. */
export function initTracing(): void {
  if (booted) {
    return;
  }
  booted = true;
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  const exporter = new RingExporter();
  processor = new SimpleSpanProcessor(exporter);
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: TRACER_NAME,
      [ATTR_SERVICE_VERSION]: versionIdentity().version,
    }),
    spanProcessors: [processor],
  });
  trace.setGlobalTracerProvider(provider);
  tracer = provider.getTracer(TRACER_NAME);
}

function getTracer(): Tracer {
  if (tracer === undefined) {
    // Defensive: a test that imports `span()` without booting first lazy-boots. Production calls
    // initTracing() once at the composition root before any span opens.
    initTracing();
  }
  if (tracer === undefined) {
    throw new Error("tracing: getTracer() called before initTracing()");
  }
  return tracer;
}

/**
 * Open a child span around `fn`. The current span (if any) becomes the parent via OTel context; with none
 * (background work) this becomes a detached root, bucketed via the request-id attribute the caller passed.
 * A throw marks the span error, records the message as an event, and re-throws (the caller sees the same
 * shape as without tracing).
 */
export function span<T>(name: string, fn: (span: Span) => Promise<T> | T, attrs: SpanAttrs = {}): Promise<T> {
  const t = getTracer();
  const opts: SpanOptions = { attributes: cleanAttrs(attrs) };
  const parent = trace.getActiveSpan();
  if (parent !== undefined) {
    // `attributes` is NOT part of the public OTel `Span` interface — it is the SDK concrete-span property,
    // read via an internal cast to copy the request id down so the ring buckets the whole tree. If a
    // future OTel drops/renames it the cast yields `undefined` and the child lands without the request id:
    // it degrades gracefully (missing from its bucket; traces still record), it does NOT throw.
    const parentAttrs = (parent as unknown as { attributes?: Record<string, unknown> }).attributes;
    const reqId = parentAttrs?.[REQUEST_ID_ATTR];
    if (typeof reqId === "string") {
      opts.attributes = { ...opts.attributes, [REQUEST_ID_ATTR]: reqId };
    }
  }
  return t.startActiveSpan(name, opts, async (child) => {
    try {
      const result = await fn(child);
      child.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      child.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(err) });
      child.addEvent("exception", {
        "exception.message": errorMessage(err),
        "exception.type": err instanceof Error ? err.name : "unknown",
      });
      throw err;
    } finally {
      child.end();
    }
  });
}

/**
 * Open a REQUEST-ROOT span — sets the request-id attribute so the processor buckets the whole tree under it.
 * Used by the per-request middleware, the workload runner, and post-request background work. The callback
 * runs with the root active in OTel context.
 *
 * `root: true` is LOAD-BEARING, not decoration: the ring seals a bucket only when a span with NO parent lands
 * (`TraceRing.ingest`). Called while another span is active — which is exactly the post-request background
 * case (the engine's rpg round is dispatched from inside the `trpc.*` span it outlives) — OTel would
 * otherwise parent this span to that one, and the bucket keyed by THIS request id would never see a
 * parentless span: the whole subtree would sit unsealed until evicted as a leak, i.e. silently invisible.
 * `root: true` is the OTel-native detach, and it makes this function's name true from every call site.
 */
export function withRequestSpan<T>(requestId: string, name: string, attrs: SpanAttrs, fn: () => Promise<T> | T): Promise<T> {
  const t = getTracer();
  return t.startActiveSpan(name, { attributes: { ...cleanAttrs(attrs), [REQUEST_ID_ATTR]: requestId }, root: true }, async (root) => {
    try {
      const result = await fn();
      // Do NOT clobber an ERROR status a HANDLED throw already set on this root while `next()` still
      // resolved normally. Hono's compose() catches a thrown request handler at ITS origin dispatch frame
      // (below the observability middleware), converts it to a Response via `app.onError`, and resolves
      // `next()` normally — so a thrown request reaches here on the SUCCESS path. `recordThrownRequest`
      // (called from that onError, root still active) marks ERROR; the SDK's setStatus lets a later OK
      // overwrite a prior ERROR (only OK is final — verified against @opentelemetry/sdk-trace-base), so
      // guard explicitly or the /api/_debug/traces status would seal back to "ok".
      if (spanStatusCode(root) !== SpanStatusCode.ERROR) {
        root.setStatus({ code: SpanStatusCode.OK });
      }
      return result;
    } catch (err) {
      root.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(err) });
      throw err;
    } finally {
      root.end();
    }
  });
}

/** Start work that deliberately outlives its caller. The operation FACTORY runs inside its own request-root
 * span; returning `void` is the explicit contract that callers receive no completion or ordering guarantee.
 * This function owns the Promise completely: the root records the rejection, then the terminal catch emits
 * one structured operator-visible error. Durable writes and canonical event emissions must be awaited by
 * their caller instead of using this boundary. */
export function superviseDetached(requestId: string, name: string, attrs: SpanAttrs, operation: () => Promise<unknown> | unknown): void {
  withRequestSpan(requestId, name, attrs, operation).catch((err: unknown) => {
    getLog().error({ ...cleanAttrs(attrs), err, requestId, spanName: name }, "detached operation failed");
  });
}

/** {@link superviseDetached} for a caller that must know the work has settled, such as a seed tool that has to
 * be deterministic: the same root span and the same operator-visible error. The promise resolves once the work
 * succeeds or its failure is logged, and never rejects, so awaiting it cannot fail the caller's write. */
export function superviseSettled(requestId: string, name: string, attrs: SpanAttrs, operation: () => Promise<unknown> | unknown): Promise<void> {
  return withRequestSpan(requestId, name, attrs, operation).then(
    () => undefined,
    (err: unknown) => {
      getLog().error({ ...cleanAttrs(attrs), err, requestId, spanName: name }, "detached operation failed");
    },
  );
}

/** Read the SDK concrete-span status code through the same internal cast `span()` uses for `.attributes`
 *  (the OTel WRITE `Span` interface omits `.status`). Degrades to `undefined` — the OK-set path, i.e. prior
 *  behavior — if a future OTel renames the property; it never throws. */
function spanStatusCode(s: Span): SpanStatusCode | undefined {
  return (s as unknown as { status?: { code?: SpanStatusCode } }).status?.code;
}

/**
 * Record a THROWN (non-Response) request on the active request-root span, then leave the throw to Hono's
 * `app.onError` (this does NOT itself produce a Response). Hono's compose() catches a handler throw at its
 * ORIGIN dispatch frame — BELOW the observability middleware — so the throw never rejects the middleware's
 * `next()` and `withRequestSpan` would otherwise seal the root as "ok" (invisible to /api/_debug/traces as
 * an error). Called from `observabilityErrorHandler` while the root is still active in the same await chain:
 * marks it error + records the SAME `exception` event `span()` emits (ONE trace format — no new shape), so
 * the ring records `status: "error"` with the error. No-op when there is no active span (a throw ABOVE the
 * middleware — e.g. in the auth seam — was never traced, so there is nothing to correct).
 */
export function recordThrownRequest(err: unknown): void {
  const active = trace.getActiveSpan();
  if (active === undefined) {
    return;
  }
  active.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(err) });
  active.addEvent("exception", {
    "exception.message": errorMessage(err),
    "exception.type": err instanceof Error ? err.name : "unknown",
  });
}

/** Add an event marker to the current span (no-op if there is none) — a point-in-time annotation within a
 *  long-running span (a cache hit, a retry attempt). */
export function addSpanEvent(name: string, attrs: SpanAttrs = {}): void {
  trace.getActiveSpan()?.addEvent(name, cleanAttrs(attrs));
}

/** Attach attributes to the current span (no-op if there is none) — for info learned mid-span (tokens-out,
 *  the row count a query returned). */
export function setSpanAttrs(attrs: SpanAttrs): void {
  trace.getActiveSpan()?.setAttributes(cleanAttrs(attrs));
}

/** Read APIs for /api/_debug/traces. */
export function recentTraces(limit: number): RequestTrace[] {
  return traceRing.recent(limit);
}
export function getTraceByRequestId(requestId: string): RequestTrace | undefined {
  return traceRing.get(requestId);
}

// The right seam for query timing is the libSQL client itself (drizzle's logger is pre-query only). We wrap
// execute/batch/executeMultiple/transaction via Proxy so every query opens a child span attached to the
// active span (the procedure → verb chain). The wrap lives here but is INJECTED into `@orb/db`'s `createDb`
// at the composition root (db cannot import server — the cake), conforming to `@orb/db`'s `LibSqlWrap`.

interface LibSqlExecuteArg {
  sql?: string;
}
interface LibSqlExecuteResult {
  rows?: readonly unknown[];
  rowsAffected?: number;
}

const INSTRUMENTED_METHODS = new Set(["execute", "batch", "executeMultiple", "transaction"]);

/** Build the span-attrs for one instrumented libSQL call (the sql excerpt / batch length the viewer
 *  renders). Kept separate so `wrapLibSqlClient` stays under the cognitive-complexity cap. */
function callAttrs(method: string, args: readonly unknown[]): SpanAttrs {
  const attrs: SpanAttrs = { "db.method": method };
  const arg = args[0];
  if (method === "execute" || method === "executeMultiple") {
    if (typeof arg === "string") {
      attrs["db.sql"] = arg;
    } else if (arg !== null && typeof arg === "object" && "sql" in arg) {
      attrs["db.sql"] = (arg as LibSqlExecuteArg).sql ?? "";
    }
  } else if (method === "batch" && Array.isArray(arg)) {
    attrs["db.batch.size"] = arg.length;
  }
  return attrs;
}

function enrichExecuteResult(result: unknown): void {
  if (result === null || typeof result !== "object") {
    return;
  }
  const r = result as LibSqlExecuteResult;
  if (Array.isArray(r.rows)) {
    setSpanAttrs({ "db.rows": r.rows.length });
  }
  if (typeof r.rowsAffected === "number") {
    setSpanAttrs({ "db.rowsAffected": r.rowsAffected });
  }
}

/** Wrap a libSQL `Client`-shaped object so every query opens a child span. Non-instrumented methods pass
 *  through but ARE BOUND TO THE TARGET — load-bearing: libSQL's Sqlite3Client uses TC39 private fields
 *  (`#checkNotClosed()`) that throw a TypeError when invoked with the Proxy as `this`. Returning
 *  `value.bind(target)` for every function keeps the brand check happy so `migrate()`/`close()`/`sync()`
 *  keep working (docs/law/Tier-2-Foundation.md esoteric #8). Generic so it stays decoupled from libSQL's exact shape
 *  while remaining assignable to `@orb/db`'s `LibSqlWrap`. Injected into `createDb` at `entry/`. */
export function wrapLibSqlClient<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, _receiver): unknown {
      // Reflect against the TARGET (not the proxy) so any prototype getter touching a private field works.
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function" || typeof prop !== "string") {
        return value;
      }
      if (!INSTRUMENTED_METHODS.has(prop)) {
        return value.bind(target); // bind-to-target so private fields survive (see header).
      }
      return (...args: unknown[]): Promise<unknown> =>
        span(
          `db.${prop}`,
          async () => {
            // `.apply(target, …)` for the same private-field reason as the bind above.
            const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
            if (prop === "execute") {
              enrichExecuteResult(result);
            }
            return result;
          },
          callAttrs(prop, args),
        );
    },
  });
}

function serializeSpan(readable: ReadableSpan, requestId: string): SerializedSpan {
  const ctx = readable.spanContext();
  const startedAt = hrToMs(readable.startTime);
  const endedAt = hrToMs(readable.endTime);
  return {
    spanId: ctx.spanId,
    parentSpanId: readable.parentSpanContext?.spanId,
    name: readable.name,
    startedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    status: readable.status.code === SpanStatusCode.ERROR ? "error" : "ok",
    attributes: serializeAttrs(readable.attributes),
    events: readable.events.map((e) => {
      // exactOptionalPropertyTypes: set `attributes` only when populated.
      const ev: SerializedSpanEvent = { name: e.name, at: hrToMs(e.time) };
      if (e.attributes !== undefined) {
        ev.attributes = serializeAttrs(e.attributes);
      }
      return ev;
    }),
    requestId,
  };
}

// OTel hrtime is [seconds, nanos]. Convert to ms wall-clock (matches the epoch-ms timestamps elsewhere).
function hrToMs(hr: [number, number]): number {
  return hr[0] * MS_PER_SEC + hr[1] / NS_PER_MS;
}

function truncate(s: string): string {
  return s.length > MAX_ATTR_LEN ? `${s.slice(0, MAX_ATTR_LEN)}…` : s;
}

/** Coerce span attributes to JSON-safe primitives; truncate over-long strings (a defensive bound — no
 *  attribute should carry a long string, but truncating beats hanging the viewer on a 100KB blob). */
function cleanAttrs(attrs: SpanAttrs): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "string") {
      out[k] = truncate(v);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

function serializeAttrs(raw: Readonly<Record<string, unknown>>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") {
      out[k] = truncate(v);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (Array.isArray(v)) {
      // OTel allows primitive-array attributes — flatten to a JSON string.
      out[k] = truncate(JSON.stringify(v));
    }
  }
  return out;
}
