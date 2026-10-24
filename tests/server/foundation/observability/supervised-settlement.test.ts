import type { LogLevel } from "@orb/contracts/settings";
import { createDetachedSupervision, createLogger, getTraceByRequestId, logRing, span } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";

// The runner's silent floor emits no log bytes; these cases read the error report from a root logger at error.
const REPORT_LEVEL = "error" satisfies LogLevel;
const { superviseDetached, superviseSettled } = createDetachedSupervision(createLogger(REPORT_LEVEL));

const OPERATION_KIND = "lifetime-probe";
const SUCCESS_SPAN = "owned.success";
const SUCCESS_CHILD = "owned.success.child";
const REJECTION_SPAN = "owned.rejection";
const REJECTION_CHILD = "owned.rejection.child";

test("supervised success settles only after its actual root and child trace have closed", async ({ ids }) => {
  const requestId = `settled-success:${ids.uuid()}`;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let runs = 0;
  const settled = superviseSettled(requestId, SUCCESS_SPAN, { operationKind: OPERATION_KIND }, async () => {
    runs += 1;
    entered.resolve();
    await release.promise;
    await span(SUCCESS_CHILD, () => undefined);
  });
  await entered.promise;
  expect(getTraceByRequestId(requestId)).toBeUndefined();
  release.resolve();
  await settled;
  expect(runs).toBe(1);
  const trace = getTraceByRequestId(requestId);
  expect(trace).toMatchObject({ requestId, rootName: SUCCESS_SPAN, status: "ok" });
  const root = trace?.spans.find((entry) => entry.parentSpanId === undefined);
  const child = trace?.spans.find((entry) => entry.name === SUCCESS_CHILD);
  expect(root).toBeDefined();
  expect(child?.parentSpanId).toBe(root?.spanId);
  expect(child?.status).toBe("ok");
});

test("supervised rejection settles after the error trace and exactly one existing operator log", async ({ ids }) => {
  const requestId = `settled-rejection:${ids.uuid()}`;
  const failure = new Error("settlement-probe-error");
  await superviseSettled(requestId, REJECTION_SPAN, { operationKind: OPERATION_KIND }, () => span(REJECTION_CHILD, () => Promise.reject(failure)));
  const trace = getTraceByRequestId(requestId);
  expect(trace).toMatchObject({ requestId, rootName: REJECTION_SPAN, status: "error" });
  expect(trace?.spans.find((entry) => entry.name === REJECTION_CHILD)?.status).toBe("error");
  const lines = logRing.recent(100).filter((line) => line.includes(`"requestId":"${requestId}"`));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('"level":"error"');
  expect(lines[0]).toContain(`"spanName":"${REJECTION_SPAN}"`);
  expect(lines[0]).toContain('"msg":"detached operation failed"');
  expect(lines[0]).toContain(failure.message);
});

for (const mode of ["synchronous", "asynchronous"] as const) {
  test(`detached ${mode} failure closes its own root and reports exactly once`, async ({ ids }) => {
    const requestId = `detached-${mode}:${ids.uuid()}`;
    const failure = new Error(`detached-${mode}-error`);
    expect(
      superviseDetached(requestId, REJECTION_SPAN, { operationKind: OPERATION_KIND }, () => {
        if (mode === "synchronous") {
          throw failure;
        }
        return span(REJECTION_CHILD, () => Promise.reject(failure));
      }),
    ).toBeUndefined();
    await expect.poll(() => logRing.recent(100).filter((line) => line.includes(`"requestId":"${requestId}"`))).toHaveLength(1);
    expect(getTraceByRequestId(requestId)).toMatchObject({ requestId, rootName: REJECTION_SPAN, status: "error" });
    const lines = logRing.recent(100).filter((line) => line.includes(`"requestId":"${requestId}"`));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(failure.message);
    expect(lines[0]).toContain('"msg":"detached operation failed"');
  });
}

test("settlement does not hide a failure of the canonical rejection report", async ({ ids }) => {
  const reportFailure = new Error("report attributes failed");
  let reads = 0;
  const attrs = {
    get operationKind(): string {
      reads += 1;
      if (reads === 2) {
        throw reportFailure;
      }
      return OPERATION_KIND;
    },
  };
  const requestId = `report-rejection:${ids.uuid()}`;
  await expect(superviseSettled(requestId, REJECTION_SPAN, attrs, () => Promise.reject(new Error("operation failed")))).rejects.toBe(reportFailure);
  expect(getTraceByRequestId(requestId)?.status).toBe("error");
  expect(logRing.recent(100).filter((line) => line.includes(`"requestId":"${requestId}"`))).toEqual([]);
});
