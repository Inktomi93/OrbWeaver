// @subject tests/support/node/corpus-workloads.ts
// @subject packages/server/src/transport/jobs/workloads-worker.ts
import "./composed-real.ts";
import { setTimeout as physicalDelay, setImmediate as physicalTurn } from "node:timers/promises";
import { createCharacterSchema } from "@orb/contracts/character";
import type { LogLevel } from "@orb/contracts/settings";
import { WORKLOAD_LIST_MAX_LIMIT } from "@orb/contracts/workloads";
import { characterEmbeddings, closeDb, embeddingCalls } from "@orb/db";
import { logRing } from "@orb/server/foundation/observability";
import { createFrozenClock } from "../iso/clock.ts";
import { createControlledTimers } from "../iso/timers.ts";
import { seedCorpusAccount } from "./corpus-auth.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { seedCorpusConnections } from "./corpus-seed.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { freshHeldDb } from "./db.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const WORKLOAD_LOG_LEVEL = "info" satisfies LogLevel;

const DEADLINE_OBSERVATION_TIMEOUT_MS = 10_000;
const TIMEOUT_DELIVERY_OBSERVATION_MS = 6000;
const WORKLOAD_BY_ID_READ = /from "workloads" where "workloads"\."id" = \?/u;

test(
  "an owned corpus deadline reaches its owner before blocked native reads are released",
  async () => {
    await using database = new AsyncDisposableStack();
    const held = await freshHeldDb();
    database.defer(() => closeDb(held.db));
    await using root = await createServerHarness({ logLevel: WORKLOAD_LOG_LEVEL, db: held.db, startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    const admitted = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
    const before = await caller.workloads.get({ id: admitted.id });
    const started = [admitted];
    const pending = held.hold(WORKLOAD_BY_ID_READ);
    let completed = false;
    let result: Promise<unknown> | undefined;
    try {
      root.app.supervise("corpus-timeout-control", "corpus.control", {}, async () => {
        await caller.workloads.get({ id: admitted.id });
      });
      await pending.reached;
      result = settleCorpusWorkloads(root, caller, started)
        .catch((error: unknown) => error)
        .finally(() => {
          completed = true;
        });
      await physicalDelay(TIMEOUT_DELIVERY_OBSERVATION_MS);
      expect(completed).toBe(true);
      const failure = await result;
      expect(failure).toMatchObject({
        message: expect.stringContaining('"phase":"initial-background"'),
        cause: {
          timeout: expect.any(DOMException),
          admitted: started,
          lastObserved: undefined,
        },
      });
      if (!(failure instanceof Error) || typeof failure.cause !== "object" || failure.cause === null || !("timeout" in failure.cause)) {
        throw new Error("The owned deadline lost its native cause");
      }
      expect(failure.cause.timeout).toMatchObject({ name: "TimeoutError" });
      expect(failure.cause.timeout).not.toBe(failure);
      expect(failure.message).toContain('"observation":"none"');
      expect(failure.message).not.toContain('"matched"');
    } finally {
      pending.release();
      await Promise.all([result, root.settleBackground()]);
    }
    expect(await caller.workloads.get({ id: admitted.id })).toEqual(before);
  },
  DEADLINE_OBSERVATION_TIMEOUT_MS,
);

test(
  "an owned corpus deadline retains the selected admitted index without fabricating a terminal row",
  async () => {
    await using database = new AsyncDisposableStack();
    const held = await freshHeldDb();
    database.defer(() => closeDb(held.db));
    await using root = await createServerHarness({ logLevel: WORKLOAD_LOG_LEVEL, db: held.db, startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    const admitted = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
    const started = [admitted];
    const runAdmitted = root.runAdmittedWorkload;
    if (runAdmitted === undefined) {
      throw new Error("The manual native workload driver is missing");
    }
    let driver: ReturnType<typeof runAdmitted> | undefined;
    let joined = false;
    let settlement: Promise<void> | undefined;
    const pending = held.hold(WORKLOAD_BY_ID_READ);
    const result = settleCorpusWorkloads(
      {
        ...root,
        app: root.app,
        runAdmittedWorkload: (...args: Parameters<typeof runAdmitted>) => {
          driver = runAdmitted(...args);
          return driver;
        },
      },
      caller,
      started,
    ).catch((error: unknown) => error);
    try {
      await pending.reached;
      expect(await result).toMatchObject({
        message: expect.stringContaining('"phase":"admitted-job","index":0'),
        cause: {
          timeout: expect.any(DOMException),
          phase: "admitted-job",
          index: 0,
          admitted: started,
          lastObserved: undefined,
          replay: [{ observation: "unobserved", kind: null, lastType: null, startedPresent: false, progressCount: 0, eventCount: 0 }],
        },
      });
      settlement = root.settleBackground().then(() => {
        joined = true;
      });
      await physicalTurn();
      expect(joined).toBe(false);
    } finally {
      pending.release();
      await Promise.all([driver, settlement, result, root.settleBackground()]);
    }
    expect(joined).toBe(true);
  },
  DEADLINE_OBSERVATION_TIMEOUT_MS,
);

test(
  "an owned corpus deadline labels only the scheduled worker snapshot already read before timeout",
  async () => {
    await using database = new AsyncDisposableStack();
    const held = await freshHeldDb();
    database.defer(() => closeDb(held.db));
    await using root = await createServerHarness({ logLevel: WORKLOAD_LOG_LEVEL, db: held.db });
    await root.settleBackground();
    const caller = await root.internalCallerFor(root.ownerId);
    const admitted = await caller.workloads.start({
      input: { kind: "compute-cooccurrence", params: {} },
      mode: "bulk",
      scheduledAt: root.clock.now() + 3000,
    });
    const before = await caller.workloads.get({ id: admitted.id });
    const started = [admitted];
    const gate = Promise.withResolvers<ReturnType<typeof held.hold>>();
    let pending: ReturnType<typeof held.hold> | undefined;
    const unsubscribe = root.app.workloadEvents.subscribeWorkloadWake(() => {
      if (pending === undefined && root.app.workloadEvents.getRecentWorkloadEvents(admitted.id).at(-1)?.type === "succeeded") {
        pending = held.hold(WORKLOAD_BY_ID_READ);
        gate.resolve(pending);
      }
    });
    const result = settleCorpusWorkloads(root, caller, started).catch((error: unknown) => error);
    try {
      const observation = await gate.promise;
      await observation.reached;
      const failure = await result;
      const events = root.app.workloadEvents.getRecentWorkloadEvents(admitted.id);
      expect(events.some((event) => event.type === "progress")).toBe(true);
      expect(failure).toMatchObject({
        message: expect.stringContaining('"phase":"scheduled-worker-loop","index":null'),
        cause: {
          timeout: expect.any(DOMException),
          phase: "scheduled-worker-loop",
          index: null,
          admitted: started,
          lastObserved: [before],
          replay: [
            {
              observation: "graph-replay",
              kind: "compute-cooccurrence",
              lastType: "succeeded",
              startedPresent: true,
              progressCount: events.filter((event) => event.type === "progress").length,
              eventCount: events.length,
            },
          ],
        },
      });
      expect(failure).toMatchObject({ message: expect.stringContaining('"observation":"last-observed"') });
    } finally {
      pending?.release();
      unsubscribe();
      await root.settleBackground();
      await result;
    }
    expect(await caller.workloads.get({ id: admitted.id })).toMatchObject({ status: "succeeded" });
  },
  DEADLINE_OBSERVATION_TIMEOUT_MS,
);

test(
  "an owned corpus deadline does not replace missing observations with a foreign read refusal",
  async () => {
    await using database = new AsyncDisposableStack();
    const held = await freshHeldDb();
    database.defer(() => closeDb(held.db));
    await using root = await createServerHarness({ logLevel: WORKLOAD_LOG_LEVEL, db: held.db, startJobs: false });
    const owner = await root.internalCallerFor(root.ownerId);
    const foreign = await seedCorpusAccount(root);
    const observer = await root.internalCallerFor(foreign.userId);
    const admitted = await owner.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
    const before = await owner.workloads.get({ id: admitted.id });
    const started = [admitted];
    await expect(observer.workloads.get({ id: admitted.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const pending = held.hold(WORKLOAD_BY_ID_READ);
    try {
      root.app.supervise("corpus-refused-observation", "corpus.control", {}, async () => {
        await owner.workloads.get({ id: admitted.id });
      });
      await pending.reached;
      const failure = await settleCorpusWorkloads(root, observer, started).catch((error: unknown) => error);
      expect(failure).toMatchObject({
        message: expect.stringContaining('"requested":1,"observation":"none"'),
        cause: {
          timeout: expect.any(DOMException),
          phase: "initial-background",
          index: null,
          admitted: started,
          lastObserved: undefined,
        },
      });
    } finally {
      pending.release();
      await root.settleBackground();
    }
    expect(await owner.workloads.get({ id: admitted.id })).toEqual(before);
  },
  DEADLINE_OBSERVATION_TIMEOUT_MS,
);

test("physical provider completion cannot advance persisted corpus workload time", async () => {
  const run = async (
    delayMs: number,
  ): Promise<{
    readonly jobs: Awaited<ReturnType<typeof settleCorpusWorkloads>>;
    readonly now: number;
  }> => {
    const physical = createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "The native workload preserves the ledger.",
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
    });
    let held = false;
    let deliveries = 0;
    const execute: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      if (held && deliveries === 0 && new URL(request.url).pathname === "/v1/embeddings") {
        deliveries += 1;
        // This delay belongs only to the physical provider edge, never the business clock.
        await physicalDelay(delayMs);
      }
      return await physical.execute(request);
    };
    await using root = await createServerHarness({ logLevel: WORKLOAD_LOG_LEVEL, providerFetch: execute });
    const principal = await root.principalFor(root.ownerId);
    await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle: "workload-clock", name: "The clock keeper", description: "A keeper of the deterministic ledger." }),
    });
    const connection = await seedCorpusConnections(root, principal);
    await root.settleBackground();
    const caller = await root.internalCallerFor(root.ownerId);
    const admitted = await caller.workloads.start({ input: { kind: "index", params: { source: "text", force: true } }, mode: "singular" });
    held = true;
    const jobs = await settleCorpusWorkloads(root, caller, [admitted]);
    expect(deliveries).toBe(1);
    expect(jobs).toMatchObject([{ id: admitted.id, status: "succeeded", ownerId: root.ownerId }]);
    expect(await root.db.select().from(characterEmbeddings)).toHaveLength(1);
    const accounting = await root.db.select().from(embeddingCalls);
    expect(accounting.length).toBeGreaterThan(0);
    expect(accounting.every((call) => call.connectionId === connection.embed.id && call.ownerId === root.ownerId)).toBe(true);
    return { jobs, now: root.clock.now() };
  };
  expect(await run(100)).toEqual(await run(0));
});

test("native background settlement joins the worker post-run read before certifying a logical phase", async () => {
  await using database = new AsyncDisposableStack();
  const held = await freshHeldDb();
  database.defer(() => closeDb(held.db));
  await using root = await createServerHarness({ logLevel: WORKLOAD_LOG_LEVEL, db: held.db });
  await root.settleBackground();
  const caller = await root.internalCallerFor(root.ownerId);
  const admitted = await caller.workloads.start({ input: { kind: "compute-cooccurrence", params: {} }, mode: "bulk" });
  const gate = Promise.withResolvers<ReturnType<typeof held.hold>>();
  let postRun: ReturnType<typeof held.hold> | undefined;
  const unsubscribe = root.app.workloadEvents.subscribeWorkloadWake(() => {
    if (postRun === undefined && root.app.workloadEvents.getRecentWorkloadEvents(admitted.id).at(-1)?.type === "succeeded") {
      postRun = held.hold(WORKLOAD_BY_ID_READ);
      gate.resolve(postRun);
    }
  });
  let completed = false;
  let settlement: Promise<void> | undefined;
  let turn: ReturnType<typeof settleCorpusWorkloads> | undefined;
  try {
    turn = settleCorpusWorkloads(root, caller, [admitted]);
    await (await gate.promise).reached;
    settlement = root.settleBackground().then(() => {
      completed = true;
    });
    const jobs = await caller.workloads.list();
    expect(jobs.find((job) => job.id === admitted.id)).toMatchObject({ status: "succeeded" });
    expect(completed).toBe(false);
  } finally {
    postRun?.release();
    unsubscribe();
    await Promise.all([settlement, turn]);
  }
  expect(completed).toBe(true);
});

test("native sleep registration refusal retains its worker error owner without rejecting or stranding background settlement", async () => {
  const failure = new Error("controlled worker sleep registration failure");
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  let refusing = false;
  let failures = 0;
  await using root = await createServerHarness({
    logLevel: WORKLOAD_LOG_LEVEL,
    clock,
    timers: {
      ...timers,
      timeout: (callback, ms) => {
        if (refusing) {
          failures += 1;
          throw failure;
        }
        return timers.timeout(callback, ms);
      },
    },
  });
  await root.settleBackground();
  const caller = await root.internalCallerFor(root.ownerId);
  const admitted = await caller.workloads.start({ input: { kind: "compute-cooccurrence", params: {} }, mode: "bulk" });
  const unsubscribe = root.app.workloadEvents.subscribeWorkloadWake(() => {
    if (root.app.workloadEvents.getRecentWorkloadEvents(admitted.id).at(-1)?.type === "succeeded") {
      refusing = true;
    }
  });
  try {
    const jobs = await settleCorpusWorkloads(root, caller, [admitted]);
    expect(jobs).toMatchObject([{ id: admitted.id, status: "succeeded" }]);
    await root[Symbol.asyncDispose]();
    expect(failures).toBeGreaterThan(0);
    const errors = logRing.recent(100).filter((line) => line.includes("workloads worker loop exited") && line.includes(failure.message));
    expect(errors).toHaveLength(1);
    expect(root.timers.pending()).toBe(0);
  } finally {
    unsubscribe();
  }
});

test("manual native corpus execution joins only its admitted jobs and leaves an older queued job untouched", async () => {
  await using root = await createServerHarness({ logLevel: WORKLOAD_LOG_LEVEL, startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const older = await caller.workloads.start({ input: { kind: "compute-cooccurrence", params: {} }, mode: "bulk" });
  const before = await caller.workloads.get({ id: older.id });
  const admitted = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
  expect(await settleCorpusWorkloads(root, caller, [admitted])).toMatchObject([{ id: admitted.id, status: "succeeded" }]);
  expect(await caller.workloads.get({ id: older.id })).toEqual(before);
  const cancelled = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
  await caller.workloads.cancel({ id: cancelled.id });
  await expect(settleCorpusWorkloads(root, caller, [cancelled])).rejects.toThrow("did not complete successfully");
  expect(await caller.workloads.get({ id: cancelled.id })).toMatchObject({ status: "cancelled" });
  const failed = await root.services.workloads.start({
    caller: null,
    ownerId: root.ownerId,
    funderUserId: null,
    mode: "bulk",
    input: { kind: "distill-characters", params: {} },
  });
  await expect(settleCorpusWorkloads(root, caller, [failed])).rejects.toMatchObject({
    message: expect.stringContaining('"status":"failed"'),
    cause: [expect.objectContaining({ id: failed.id, status: "failed" })],
  });
  const foreign = await seedCorpusAccount(root);
  const foreignCaller = await root.internalCallerFor(foreign.userId);
  await expect(settleCorpusWorkloads(root, foreignCaller, [admitted])).rejects.toMatchObject({ code: "NOT_FOUND" });
  const closedRunner = root.runAdmittedWorkload;
  expect(closedRunner).toBeDefined();
  await root[Symbol.asyncDispose]();
  await expect(closedRunner?.(older.id, new AbortController().signal)).rejects.toThrow();
});

test("selected native corpus settlement reads its exact admitted ID behind newer history", async () => {
  await using root = await createServerHarness({ logLevel: WORKLOAD_LOG_LEVEL, startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const admitted = await caller.workloads.start({ input: { kind: "reconcile-stats", params: {} }, mode: "singular" });
  expect(await settleCorpusWorkloads(root, caller, [admitted])).toMatchObject([{ id: admitted.id, status: "succeeded" }]);
  for (let row = 0; row < WORKLOAD_LIST_MAX_LIMIT; row += 1) {
    root.clock.advance(1);
    const newer = await root.services.workloads.start({
      caller: principal,
      ownerId: root.ownerId,
      input: { kind: "reconcile-stats", params: {} },
      mode: "singular",
    });
    await root.services.workloads.cancel({ caller: principal, id: newer.id });
  }
  const history = await caller.workloads.list();
  expect(history).toHaveLength(WORKLOAD_LIST_MAX_LIMIT);
  expect(history.some((job) => job.id === admitted.id)).toBe(false);
  const selected = await caller.workloads.get({ id: admitted.id });
  expect(selected).toMatchObject({ id: admitted.id, status: "succeeded" });
  expect(await settleCorpusWorkloads(root, caller, [admitted])).toEqual([selected]);
});
