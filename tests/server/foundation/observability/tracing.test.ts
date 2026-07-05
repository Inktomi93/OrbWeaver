// foundation/observability/tracing — the libSQL driver wrap. The load-bearing invariant
// (core/Tier-2-Foundation.md esoteric #8): non-instrumented methods pass through BOUND to the target (the
// TC39 private-field brand check). Also asserts an instrumented `execute` opens a `db.execute` child span
// that lands in the request's trace.

import {
  getTraceByRequestId,
  initTracing,
  recordThrownRequest,
  withRequestSpan,
  wrapLibSqlClient,
} from "@orb/server/foundation/observability";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

const PROBE_VALUE = 7;

describe("the libSQL client wrap", () => {
  test("non-instrumented methods are bound to the target (private-field safety)", () => {
    // A method that reads `this` — if the proxy returned it unbound, `this` would be the Proxy and a real
    // libSQL private-field access would throw. Binding to the target keeps `this` correct.
    const client = {
      value: PROBE_VALUE,
      reveal(): number {
        return this.value;
      },
    };
    const wrapped = wrapLibSqlClient(client);
    expect(wrapped.reveal()).toBe(PROBE_VALUE);
    expect(wrapped.value).toBe(PROBE_VALUE);
  });

  test("an instrumented execute opens a db.execute span inside the request trace", async () => {
    initTracing();
    const requestId = "tracing-exec-req";
    const client = {
      execute: (_sql: string): Promise<{ rows: unknown[]; rowsAffected: number }> =>
        Promise.resolve({ rows: [{}], rowsAffected: 0 }),
    };
    const wrapped = wrapLibSqlClient(client);

    await withRequestSpan(requestId, "test-root", {}, async () => {
      await wrapped.execute("SELECT 1");
    });

    const trace = getTraceByRequestId(requestId);
    if (trace === undefined) {
      throw new Error("expected a recorded trace for the request");
    }
    expect(trace.spans.some((s) => s.name === "db.execute")).toBe(true);
    expect(trace.rootName).toBe("test-root");
  });
});

describe("recordThrownRequest (the thrown-request trace-ring gap, PD-118)", () => {
  test("marks the active request-root error + records the exception, surviving the normal-return OK", async () => {
    // Mirrors the runtime shape: Hono's onError → recordThrownRequest runs while the root is active, then
    // `withRequestSpan` returns NORMALLY (the throw was converted to a Response below it) and would set OK.
    // The guard must preserve status:error, else /api/_debug/traces mislabels the thrown request "ok".
    initTracing();
    const requestId = "thrown-req-marked";
    await withRequestSpan(requestId, "http GET /throws", {}, () => {
      recordThrownRequest(new TypeError("boom-in-handler"));
      // return normally — recordThrownRequest does NOT itself throw (Hono owns the Response).
    });

    const trace = getTraceByRequestId(requestId);
    if (trace === undefined) {
      throw new Error("expected a recorded trace for the thrown request");
    }
    expect(trace.status).toBe("error");
    const root = trace.spans.find((s) => s.parentSpanId === undefined);
    const exception = root?.events.find((e) => e.name === "exception");
    expect(exception).toBeDefined();
    expect(exception?.attributes?.["exception.type"]).toBe("TypeError");
    expect(exception?.attributes?.["exception.message"]).toBe("boom-in-handler");
  });

  test("a normal (non-throwing) request still seals status:ok — the guard never over-fires", async () => {
    initTracing();
    const requestId = "thrown-req-clean";
    await withRequestSpan(requestId, "http GET /ok", {}, () => {
      // no recordThrownRequest — the happy path must remain "ok".
    });

    const trace = getTraceByRequestId(requestId);
    expect(trace?.status).toBe("ok");
  });

  test("recordThrownRequest is a safe no-op when there is no active span", () => {
    // A throw ABOVE the observability middleware (e.g. the auth seam) has no request-root span; the helper
    // must not throw — there is simply nothing to correct.
    expect(() => recordThrownRequest(new Error("no-active-span"))).not.toThrow();
  });
});
