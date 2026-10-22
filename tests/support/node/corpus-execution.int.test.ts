// @subject tests/support/node/corpus-workloads.ts
// @subject tests/support/node/server.ts
import "./composed-real.ts";
import { setTimeout as physicalDelay, setImmediate as physicalTurn } from "node:timers/promises";
import { closeDb } from "@orb/db";
import { vi } from "vitest";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { freshCountedDb, freshHeldDb } from "./db.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const WORKLOAD_BY_ID_READ = /from "workloads" where "workloads"\."id" = \?/u;
const LONGER_THAN_DEFAULT_MS = 6000;
const EXECUTION_OBSERVATION_TIMEOUT_MS = 15_000;

function cancellationOf(failure: unknown): unknown {
  if (!(failure instanceof Error) || typeof failure.cause !== "object" || failure.cause === null || !("cancellation" in failure.cause)) {
    throw new Error("The caller cancellation lost its original cause");
  }
  return failure.cause.cancellation;
}

test("a caller execution scope permits native load beyond the helper default and is borrowed unchanged by later roots", {
  timeout: EXECUTION_OBSERVATION_TIMEOUT_MS,
}, async () => {
  const controller = new AbortController();
  const options = { startJobs: false, workloadExecutionSignal: controller.signal };
  await using database = new AsyncDisposableStack();
  const held = await freshHeldDb();
  database.defer(() => closeDb(held.db));
  {
    await using root = await createServerHarness({ ...options, db: held.db });
    const caller = await root.internalCallerFor(root.ownerId);
    const admitted = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
    const pending = held.hold(WORKLOAD_BY_ID_READ);
    let completed = false;
    const result = settleCorpusWorkloads(root, caller, [admitted]).finally(() => {
      completed = true;
    });
    // Keep the refusal owned while the physical SELECT remains held, including on old-source controls.
    const outcome = result.catch((error: unknown) => error);
    try {
      await pending.reached;
      await physicalDelay(LONGER_THAN_DEFAULT_MS);
      expect(completed).toBe(false);
    } finally {
      pending.release();
      await root.settleBackground();
    }
    expect(await outcome).toMatchObject([{ id: admitted.id, status: "succeeded" }]);
    expect(Reflect.get(root, "workloadExecutionSignal")).toBe(controller.signal);
    const repeated = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
    expect(await settleCorpusWorkloads(root, caller, [repeated])).toMatchObject([{ id: repeated.id, status: "succeeded" }]);
  }
  const reason = new DOMException("The caller stopped corpus execution", "AbortError");
  controller.abort(reason);
  await using next = await createServerHarness(options);
  expect(Reflect.get(next, "workloadExecutionSignal")).toBe(controller.signal);
  const caller = await next.internalCallerFor(next.ownerId);
  const admitted = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
  const driver = vi.spyOn(next, "runAdmittedWorkload");
  const settle = vi.spyOn(next, "settleBackground");
  const failure = await settleCorpusWorkloads(next, caller, [admitted]).catch((error: unknown) => error);
  expect(failure).toMatchObject({ message: expect.stringContaining("cancelled"), cause: { cancellation: reason, lastObserved: undefined } });
  expect(cancellationOf(failure)).toBe(reason);
  expect(driver).not.toHaveBeenCalled();
  expect(settle).not.toHaveBeenCalled();
  await physicalTurn();
});

test("caller cancellation during initial native load returns its reason while background completion still owns the held SELECT", {
  timeout: EXECUTION_OBSERVATION_TIMEOUT_MS,
}, async () => {
  const controller = new AbortController();
  const options = { startJobs: false, workloadExecutionSignal: controller.signal };
  await using database = new AsyncDisposableStack();
  const held = await freshHeldDb();
  database.defer(() => closeDb(held.db));
  await using root = await createServerHarness({ ...options, db: held.db });
  const caller = await root.internalCallerFor(root.ownerId);
  const admitted = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
  const pending = held.hold(WORKLOAD_BY_ID_READ);
  const result = settleCorpusWorkloads(root, caller, [admitted]).catch((error: unknown) => error);
  let joined = false;
  let completion: Promise<void> | undefined;
  const reason = new DOMException("The caller stopped during native load", "AbortError");
  try {
    await pending.reached;
    controller.abort(reason);
    const failure = await result;
    expect(failure).toMatchObject({
      message: expect.stringContaining('"phase":"admitted-job","index":0'),
      cause: { cancellation: reason, lastObserved: undefined, replay: [{ observation: "unobserved" }] },
    });
    expect(cancellationOf(failure)).toBe(reason);
    completion = root.settleBackground().then(() => {
      joined = true;
    });
    await physicalTurn();
    expect(joined).toBe(false);
  } finally {
    pending.release();
    await Promise.all([result, completion, root.settleBackground()]);
  }
  expect(joined).toBe(true);
});

test("a foreign name-equal cancellation is not reclassified as the caller reason", async () => {
  const controller = new AbortController();
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const reason = new DOMException("caller cancellation", "TimeoutError");
  const foreign = new DOMException("caller cancellation", "TimeoutError");
  const borrowed = {
    ...root,
    app: root.app,
    workloadExecutionSignal: controller.signal,
    settleBackground: (): Promise<void> => Promise.reject(foreign),
  };
  await expect(settleCorpusWorkloads(borrowed, caller, [])).rejects.toBe(foreign);
  controller.abort(reason);
});

test("setup and repeated calls cannot renew an expired native caller timeout or start a new load", async () => {
  const workloadExecutionSignal = AbortSignal.timeout(100);
  const options = { startJobs: false, workloadExecutionSignal };
  await using database = new AsyncDisposableStack();
  const counted = await freshCountedDb();
  database.defer(() => closeDb(counted.db));
  await using root = await createServerHarness({ ...options, db: counted.db });
  const caller = await root.internalCallerFor(root.ownerId);
  const admitted = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
  await physicalDelay(150);
  expect(workloadExecutionSignal.aborted).toBe(true);
  const driver = vi.spyOn(root, "runAdmittedWorkload");
  const initial = vi.spyOn(root, "settleBackground");
  counted.queries.reset();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const failure = await settleCorpusWorkloads(root, caller, [admitted]).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: expect.stringContaining("timed out"), cause: { timeout: workloadExecutionSignal.reason } });
    if (!(failure instanceof Error) || typeof failure.cause !== "object" || failure.cause === null || !("timeout" in failure.cause)) {
      throw new Error("The native caller timeout lost its owned cause");
    }
    expect(failure.cause.timeout).toBe(workloadExecutionSignal.reason);
  }
  expect(driver).not.toHaveBeenCalled();
  expect(initial).not.toHaveBeenCalled();
  expect(counted.queries.count()).toBe(0);
  await physicalTurn();
});
