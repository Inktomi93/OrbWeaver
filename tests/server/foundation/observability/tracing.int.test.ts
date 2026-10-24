import {
  addSpanEvent,
  createLogger,
  createRequestObservability,
  getTraceByRequestId,
  initTracing,
  setSpanAttrs,
  span,
  withRequestSpan,
} from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import { createTestEnv } from "@orb/testkit/node/helpers";
import { Hono } from "hono";

const ROOT = "migration.request";
const CHILD = "migration.child";
const GRANDCHILD = "migration.grandchild";

test("interleaved async requests retain their own child and grandchild parentage", async ({ ids }) => {
  initTracing();
  initTracing();
  const release = Promise.withResolvers<void>();
  const requests = [0, 1].map(() => ({ requestId: `concurrent:${ids.uuid()}`, entered: Promise.withResolvers<void>() }));
  const running = requests.map(({ requestId, entered }) =>
    withRequestSpan(requestId, ROOT, {}, () =>
      span(CHILD, async () => {
        entered.resolve();
        await release.promise;
        await span(GRANDCHILD, () => undefined);
      }),
    ),
  );
  try {
    await Promise.all(requests.map(({ entered }) => entered.promise));
    for (const { requestId } of requests) {
      expect(getTraceByRequestId(requestId)).toBeUndefined();
    }
  } finally {
    release.resolve();
    await Promise.all(running);
  }
  for (const { requestId } of requests) {
    const recorded = getTraceByRequestId(requestId);
    expect(recorded).toMatchObject({ requestId, rootName: ROOT, status: "ok", totals: { spanCount: 3 } });
    expect(recorded?.spans.map((entry) => entry.name).sort()).toEqual([ROOT, CHILD, GRANDCHILD].sort());
    const root = recorded?.spans.find((entry) => entry.name === ROOT);
    const child = recorded?.spans.find((entry) => entry.name === CHILD);
    const grandchild = recorded?.spans.find((entry) => entry.name === GRANDCHILD);
    expect(root?.parentSpanId).toBeUndefined();
    expect(child?.parentSpanId).toBe(root?.spanId);
    expect(grandchild?.parentSpanId).toBe(child?.spanId);
    expect(recorded?.spans.map((entry) => entry.requestId)).toEqual([requestId, requestId, requestId]);
  }
});

test("a handled HTTP error retains error status and redacts its invite capability", async ({ ids }) => {
  const requestId = `handled:${ids.uuid()}`;
  const failure = new Error("handled-request-failure");
  const token = "private-invite-fixture";
  const { observability, observabilityErrorHandler } = createRequestObservability(createLogger(createTestEnv().LOG_LEVEL));
  const app = new Hono();
  app.use("*", observability);
  app.onError(observabilityErrorHandler);
  app.get("/join/:token", () => {
    throw failure;
  });
  const response = await app.request(`/join/${token}`, { headers: { "X-Request-Id": requestId } });
  expect(response.status).toBe(500);
  expect(response.headers.get("X-Request-Id")).toBe(requestId);
  const recorded = getTraceByRequestId(requestId);
  expect(recorded).toMatchObject({ rootName: "http GET /join/:token", status: "error", totals: { spanCount: 1 } });
  expect(recorded?.spans[0]?.attributes["http.path"]).toBe("/join/:token");
  expect(JSON.stringify(recorded)).not.toContain(token);
  expect(recorded?.spans[0]?.events).toEqual([
    expect.objectContaining({ name: "exception", attributes: { "exception.message": failure.message, "exception.type": "Error" } }),
  ]);
});

test("cancellation propagates the original reason and ends both spans as errors", async ({ ids }) => {
  const requestId = `cancelled:${ids.uuid()}`;
  const controller = new AbortController();
  const reason = new Error("cancelled-request");
  controller.abort(reason);
  await expect(
    withRequestSpan(requestId, ROOT, {}, () =>
      span(CHILD, async () => {
        await Promise.resolve();
        controller.signal.throwIfAborted();
      }),
    ),
  ).rejects.toBe(reason);
  const recorded = getTraceByRequestId(requestId);
  expect(recorded).toMatchObject({ status: "error", totals: { spanCount: 2 } });
  expect(recorded?.spans.map((entry) => entry.status)).toEqual(["error", "error"]);
  expect(recorded?.spans.find((entry) => entry.name === CHILD)?.events).toEqual([
    expect.objectContaining({ name: "exception", attributes: { "exception.message": reason.message, "exception.type": "Error" } }),
  ]);
});

test("the ring keeps bounded scalar metadata, native arrays and event attributes", async ({ ids }) => {
  const requestId = `metadata:${ids.uuid()}`;
  const long = "metadata".repeat(256);
  await withRequestSpan(requestId, ROOT, {}, () =>
    span(CHILD, (active) => {
      active.setAttribute("native.array", ["first", "second"]);
      setSpanAttrs({ detail: long, count: 2, enabled: true, absent: undefined });
      addSpanEvent("metadata.event", { detail: long, count: 2, enabled: true });
    }),
  );
  const child = getTraceByRequestId(requestId)?.spans.find((entry) => entry.name === CHILD);
  expect(child?.attributes).toMatchObject({ "native.array": '["first","second"]', count: 2, enabled: true });
  expect(child?.attributes).not.toHaveProperty("absent");
  const bounded = child?.attributes["detail"];
  expect(bounded).toBe(`${long.slice(0, 512)}…`);
  expect(child?.events).toEqual([expect.objectContaining({ name: "metadata.event", attributes: { detail: bounded, count: 2, enabled: true } })]);
});
