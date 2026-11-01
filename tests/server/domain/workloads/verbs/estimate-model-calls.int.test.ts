// The confirm's size of a run, asked through the workloads door: it answers null for a kind that calls no model, refuses a
// mode the kind does not run before counting, keeps retry's visibility gates, and agrees with what the enqueue doors admit.
// @subject packages/server/src/domain/workloads/verbs/estimate-model-calls.ts
// @subject packages/server/src/domain/workloads/verbs/retry.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { WORKLOAD_NOT_ADMISSIBLE } from "@orb/contracts/workloads";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createMemoryBackfillRoom, createServerHarness, seedCorpusConnections } from "@orb/testkit/node/composed";

const DISTILL = { kind: "distill-characters", params: {} } satisfies StartWorkloadInput;
const STATS = { kind: "reconcile-stats", params: {} } satisfies StartWorkloadInput;
const MEMORY = { kind: "memory-backfill", params: {} } satisfies StartWorkloadInput;
const CATALOG = { kind: "refresh-model-catalog", params: {} } satisfies StartWorkloadInput;
const IMPORT_ST = { kind: "import-st", params: { dryRun: true } } satisfies StartWorkloadInput;

test("a kind that calls no model answers null, never zero, and a kind that does answers a count", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const owner = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, owner);
  await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Keeper", handle: "keeper", description: "A keeper." }),
  });
  await root.settleBackground();

  expect(await root.services.workloads.estimateModelCalls({ caller: owner, mode: "singular", input: STATS })).toEqual({ calls: null });
  expect(await root.services.workloads.estimateModelCalls({ caller: owner, mode: "singular", input: DISTILL })).toEqual({ calls: 1 });
});

test("a mode the kind does not run is refused, the same kind's supported mode is not, and the refusal comes before any count", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const owner = await root.principalFor(root.ownerId);

  await expect(root.services.workloads.estimateModelCalls({ caller: owner, mode: "singular", input: CATALOG })).rejects.toBeInstanceOf(DomainOperationError);
  expect(await root.services.workloads.estimateModelCalls({ caller: owner, mode: "bulk", input: CATALOG })).toEqual({ calls: null });
});

test("a retry estimate answers a stranger and a missing id with the same not-found, and the row's owner with its answer", async ({ ids }) => {
  await using root = await createServerHarness({ startJobs: false });
  const owner = await root.principalFor(root.ownerId);
  const stranger = await root.principalFor((await root.actor()).id);
  const row = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "singular", input: STATS });

  expect(await root.services.workloads.estimateRetryModelCalls({ caller: owner, id: row.id })).toEqual({ calls: null });
  const missing = mintTypeId(ID_PREFIX.workload, ids.next);
  for (const id of [row.id, missing]) {
    await expect(root.services.workloads.estimateRetryModelCalls({ caller: stranger, id })).rejects.toBeInstanceOf(DomainNotFoundError);
  }
  await expect(root.services.workloads.estimateRetryModelCalls({ caller: owner, id: missing })).rejects.toBeInstanceOf(DomainNotFoundError);
});

test("a bulk create-kind run through the door mints for its named target, on the estimate and the start, and refuses without one", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const target = await root.actor();
  const scope = { input: IMPORT_ST, mode: "bulk" } as const;

  await expect(caller.workloads.estimateModelCalls(scope)).rejects.toThrow("targetOwnerId");
  await expect(caller.workloads.start(scope)).rejects.toThrow("targetOwnerId");

  const targeted = { ...scope, targetOwnerId: target.id };
  expect(await caller.workloads.estimateModelCalls(targeted)).toEqual({ calls: null });
  const ref = await caller.workloads.start(targeted);
  expect(await caller.workloads.get({ id: ref.id })).toMatchObject({ kind: IMPORT_ST.kind, ownerId: target.id });
});

// The memory sweep is the one kind whose owning domain refuses a run (memory turned off); the chat suite owns its counts.

test("a run the owning domain would refuse counts zero unless the confirm asks to be counted as admitted", async () => {
  await using memory = await createMemoryBackfillRoom();
  const room = memory.h;
  const ask = async (assumeAdmitted?: boolean): Promise<unknown> =>
    await room.caller.workloads.estimateModelCalls({ input: MEMORY, mode: "singular", ...(assumeAdmitted === undefined ? {} : { assumeAdmitted }) });
  const admitted = await ask();
  expect(admitted).toEqual({ calls: expect.any(Number) });
  expect(admitted).not.toEqual({ calls: 0 });

  await room.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  expect(await ask()).toEqual({ calls: 0 });
  // The turn-on confirm counts before the switch that would admit the run.
  expect(await ask(true)).toEqual(admitted);
});

test("a retry estimate agrees with the retry itself: a row the owning domain would now refuse counts zero and is refused", async () => {
  await using memory = await createMemoryBackfillRoom();
  const room = memory.h;
  const queued = await room.caller.workloads.start({ input: MEMORY, mode: "singular" });
  const before = await room.caller.workloads.estimateRetryModelCalls({ id: queued.id });
  expect(before.calls).toBeGreaterThan(0);

  await room.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  expect(await room.caller.workloads.estimateRetryModelCalls({ id: queued.id })).toEqual({ calls: 0 });
  await expect(room.root.services.workloads.retry({ caller: room.owner, id: queued.id })).rejects.toMatchObject({ code: WORKLOAD_NOT_ADMISSIBLE });
});
