// @subject tests/support/node/corpus-workloads.ts
// @subject packages/server/src/transport/jobs/workloads-worker.ts
import "./composed-real.ts";
import { setTimeout as physicalDelay } from "node:timers/promises";
import { createCharacterSchema } from "@orb/contracts/character";
import { WORKLOAD_LIST_MAX_LIMIT } from "@orb/contracts/workloads";
import { characterEmbeddings, closeDb, embeddingCalls } from "@orb/db";
import { logRing } from "@orb/server/foundation/observability";
import { afterAll, vi } from "vitest";
import { createFrozenClock } from "../iso/clock.ts";
import { createControlledTimers } from "../iso/timers.ts";
import { seedCorpusAccount } from "./corpus-auth.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { seedCorpusConnections } from "./corpus-seed.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { freshHeldDb } from "./db.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

vi.hoisted(() => {
  vi.stubEnv("LOG_LEVEL", "error");
});
afterAll(() => vi.unstubAllEnvs());

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
    await using root = await createServerHarness({ providerFetch: execute });
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
  await using root = await createServerHarness({ db: held.db });
  await root.settleBackground();
  const caller = await root.internalCallerFor(root.ownerId);
  const admitted = await caller.workloads.start({ input: { kind: "compute-cooccurrence", params: {} }, mode: "bulk" });
  const gate = Promise.withResolvers<ReturnType<typeof held.hold>>();
  let postRun: ReturnType<typeof held.hold> | undefined;
  const unsubscribe = root.app.workloadEvents.subscribeWorkloadWake(() => {
    if (postRun === undefined && root.app.workloadEvents.getRecentWorkloadEvents(admitted.id).at(-1)?.type === "succeeded") {
      postRun = held.hold(/from "workloads" where "workloads"\."id" = \?/u);
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
  await using root = await createServerHarness({ startJobs: false });
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
  await using root = await createServerHarness({ startJobs: false });
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
