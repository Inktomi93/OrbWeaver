// domain/discovery/substrate/structured-retry-trace — the retry annotation landing proof (the standing
// observability law): the built closure ANNOTATES the active request span with the shared
// `provider.structured.retry` event, naming the FILE-LOCAL lane + the issue count + the joined paths.
// METADATA ONLY, per the header — never zod message text. Mirrors the refinery twin's test shape.

import { getTraceByRequestId, initTracing, withRequestSpan } from "@orb/server/foundation/observability";
import { describe } from "vitest";
import { traceStructuredRetry } from "../../../../../packages/server/src/domain/discovery/substrate/structured-retry-trace.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function traceEvents(requestId: string): { readonly name: string; readonly attributes: Record<string, string | number | boolean> }[] {
  const trace = getTraceByRequestId(requestId);
  if (trace === undefined) {
    throw new Error(`expected a sealed trace for request ${requestId}`);
  }
  return trace.spans.flatMap((s) => s.events.map((e) => ({ name: e.name, attributes: e.attributes ?? {} })));
}

describe("traceStructuredRetry ANNOTATES the request span (addSpanEvent landing proof)", () => {
  test("a retry lands the shared event naming the lane, issue count and joined paths", async () => {
    initTracing();
    const requestId = "obs-discovery-retry";
    await withRequestSpan(requestId, "test dispatch", {}, () => {
      const onRetry = traceStructuredRetry("ask-card");
      onRetry({ issueCount: 2, paths: ["fields.0.text", "fields.1.text"] });
      return Promise.resolve();
    });
    const events = traceEvents(requestId);
    expect(events).toEqual([{ name: "provider.structured.retry", attributes: { lane: "ask-card", issueCount: 2, paths: "fields.0.text,fields.1.text" } }]);
  });

  test("outside an active span it is a silent no-op — never throws", () => {
    const onRetry = traceStructuredRetry("distill-card");
    expect(() => onRetry({ issueCount: 1, paths: ["name"] })).not.toThrow();
  });

  test("each discovery lane names itself in the emitted event", async () => {
    initTracing();
    const requestId = "obs-discovery-retry-lane";
    await withRequestSpan(requestId, "test dispatch", {}, () => {
      traceStructuredRetry("compare-narrative")({ issueCount: 1, paths: ["name"] });
      return Promise.resolve();
    });
    expect(traceEvents(requestId)[0]?.attributes["lane"]).toBe("compare-narrative");
  });
});
