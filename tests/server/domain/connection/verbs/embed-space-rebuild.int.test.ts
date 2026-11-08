// Moving the owner's embedding space queues the owner's forced rebuild and nothing else. Two real embedding
// connections on one scripted endpoint are two spaces; the queue is read through the workloads verb the owner
// reads their own jobs with, and one enqueue is refused at the native libSQL client the root's database hands over.
// @subject packages/server/src/domain/connection/verbs/bindings.ts
// @subject packages/server/src/domain/embeddings/verbs/embedding-reindex-triggers.ts

import type { Principal } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { LibSqlWrap } from "@orb/db";
import type { UserConnectionId } from "@orb/kit/ids";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_ALTERNATE_EMBED_MODEL,
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshDb,
  seedCorpusConnections,
  seedEmbeddingConnection,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";

const REBUILD_KINDS = ["index", "databank-reindex", "memory-backfill"] as const;
const WORKLOAD_DEADLINE_MS = 60_000;
const WORKLOAD_INSERT = 'insert into "workloads"';
const REINDEX_SPAN = "embeddings.modelChangeReindex";
const WORKLOADS_CHANGED = "workloadsChanged" satisfies UserBusEvent["type"];
// Published after the move settles, so a missing announcement ends the read instead of hanging it.
const END: UserBusEvent = { type: "charactersChanged" };

type NativeDriver = Parameters<LibSqlWrap>[0];
type BatchStatement = Parameters<NativeDriver["batch"]>[0][number];
type TransactionMode = NonNullable<Parameters<NativeDriver["batch"]>[1]>;

function sqlOf(statement: BatchStatement): string {
  if (typeof statement === "string") {
    return statement;
  }
  return Array.isArray(statement) ? statement[0] : statement.sql;
}

interface Box {
  readonly root: ServerTestHarness;
  readonly principal: Principal;
  readonly first: UserConnectionId;
  readonly second: UserConnectionId;
  /** Refuse the next workload insert at the native client. */
  readonly refuseNextEnqueue: () => void;
}

/** A root whose owner has one embedding connection bound and pinned, and a second encoder on the same endpoint. */
async function twoEncoders(stack: AsyncDisposableStack): Promise<Box> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL, CORPUS_ALTERNATE_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
    completion: () => {
      throw new Error("an embedding move must not request a model reply");
    },
  });
  let client: NativeDriver | undefined;
  const db = stack.use(
    await freshDb((opened) => {
      client = opened;
      return opened;
    }),
  ).db;
  const root = stack.use(await createServerHarness({ providerFetch: physical.execute, startJobs: false, db, logLevel: "error" }));
  if (client === undefined) {
    throw new Error("the root's database never handed over its native client");
  }
  const driver = client;
  let refusals = 0;
  const execute = driver.execute.bind(driver);
  const batch = driver.batch.bind(driver);
  const refuses = (sql: string): boolean => {
    if (refusals > 0 && sql.includes(WORKLOAD_INSERT)) {
      refusals -= 1;
      return true;
    }
    return false;
  };
  vi.spyOn(driver, "execute").mockImplementation((statement, args) =>
    refuses(sqlOf(statement)) ? Promise.reject(new Error("controlled workload insert refusal")) : execute(statement, args),
  );
  vi.spyOn(driver, "batch").mockImplementation((statements, mode) => {
    const refused = statements.some((statement) => refuses(sqlOf(statement)));
    return refused ? Promise.reject(new Error("controlled workload insert refusal")) : batch(statements, mode);
  });
  // The property resolves to the overload set whose last signature is the deprecated zero-argument form; every call below passes its mode.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const transaction: (mode: TransactionMode) => ReturnType<NativeDriver["transaction"]> = driver.transaction.bind(driver);
  vi.spyOn(driver, "transaction").mockImplementation(async (mode?: TransactionMode) => {
    if (mode === undefined) {
      throw new Error("a transaction was opened without a mode");
    }
    const open = await transaction(mode);
    const inner = open.execute.bind(open);
    vi.spyOn(open, "execute").mockImplementation((statement) =>
      refuses(sqlOf(statement)) ? Promise.reject(new Error("controlled workload insert refusal")) : inner(statement),
    );
    return open;
  });
  const principal = await root.principalFor(root.ownerId);
  const seeded = await seedCorpusConnections(root, principal);
  const second = await seedEmbeddingConnection(root, principal, { model: CORPUS_ALTERNATE_EMBED_MODEL });
  // The stored target names the first encoder before the case begins, so a later bind is judged against it.
  await root.app.embeddings.resolveGeneration(root.ownerId, "embed");
  await root.settleBackground();
  return {
    root,
    principal,
    first: seeded.embed.id,
    second: second.id,
    refuseNextEnqueue: (): void => {
      refusals = 1;
    },
  };
}

async function rebuilds(box: Box): Promise<Awaited<ReturnType<ServerTestHarness["services"]["workloads"]["list"]>>> {
  const rows = await box.root.services.workloads.list({ caller: box.principal });
  return rows.filter((row) => REBUILD_KINDS.some((kind) => kind === row.kind));
}

const bind = (box: Box, connectionId: UserConnectionId | null): Promise<unknown> =>
  box.root.services.connection.setBinding({ principal: box.principal, task: "embed", connectionId });

const reindexErrors = (box: Box): readonly string[] => box.root.observability.logLines().filter((line) => line.includes(REINDEX_SPAN));

test("unbinding the encoder queues nothing, and binding the encoder the stored target already names queues nothing", async () => {
  await using stack = new AsyncDisposableStack();
  const box = await twoEncoders(stack);
  const before = await rebuilds(box);

  await bind(box, null);
  await box.root.settleBackground();
  expect(await rebuilds(box)).toEqual(before);

  await bind(box, box.first);
  await box.root.settleBackground();
  expect(await rebuilds(box)).toEqual(before);
  expect(reindexErrors(box)).toEqual([]);
});

test("binding a second encoder queues the owner's own forced rebuild, readable by the owner and runnable to the end", async () => {
  await using stack = new AsyncDisposableStack();
  const box = await twoEncoders(stack);
  const before = await rebuilds(box);

  await bind(box, box.second);
  await box.root.settleBackground();
  const queued = (await rebuilds(box)).filter((row) => !before.some((old) => old.id === row.id));

  expect(queued.find((row) => row.kind === "index")).toMatchObject({
    ownerId: box.root.ownerId,
    mode: "singular",
    params: { source: "all", force: true, embedderChanged: true },
  });
  expect(queued.find((row) => row.kind === "databank-reindex")).toMatchObject({ ownerId: box.root.ownerId, params: { embedderChanged: true } });
  expect(nonEmpty(queued).every((row) => row.mode === "singular")).toBe(true);

  const run = box.root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  for (const row of queued) {
    await run(row.id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
    expect(await box.root.services.workloads.get({ caller: box.principal, id: row.id })).toMatchObject({ status: "succeeded" });
  }
});

test("the owner's live channel hears that the rebuild was queued", async () => {
  await using stack = new AsyncDisposableStack();
  const box = await twoEncoders(stack);
  const before = await rebuilds(box);
  const stop = new AbortController();
  const events = box.root.app.liveBuses.user.subscribeUserEvents(box.root.ownerId, stop.signal)[Symbol.asyncIterator]();
  try {
    await bind(box, box.second);
    await box.root.settleBackground();
    box.root.app.liveBuses.user.publishUserEvent(box.root.ownerId, END);
    const heard: UserBusEvent[] = [];
    for (let next = await events.next(); !next.done && next.value !== END; next = await events.next()) {
      heard.push(next.value);
    }
    expect((await rebuilds(box)).length).toBeGreaterThan(before.length);
    expect(heard).toContainEqual({ type: WORKLOADS_CHANGED });
  } finally {
    stop.abort();
  }
});

test("a refused enqueue is logged under the reindex span and does not fail the binding write", async () => {
  await using stack = new AsyncDisposableStack();
  const box = await twoEncoders(stack);
  const before = await rebuilds(box);

  box.refuseNextEnqueue();
  await bind(box, box.second);
  await box.root.settleBackground();

  expect(reindexErrors(box).length).toBeGreaterThan(0);
  expect((await rebuilds(box)).length).toBeLessThan(before.length + REBUILD_KINDS.length);
});
