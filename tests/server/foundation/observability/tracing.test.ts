// foundation/observability/tracing — the libSQL driver wrap. The two load-bearing invariants
// (core/Tier-2-Foundation.md #6/#8): non-instrumented methods pass through BOUND to the target (the TC39
// private-field brand check), and an instrumented `execute` opens a `db.execute` child span that lands in
// the request's trace.

import {
  getTraceByRequestId,
  initTracing,
  withRequestSpan,
  wrapLibSqlClient,
} from "@orb/server/foundation/observability";
import { describe, expect, test } from "vitest";

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
