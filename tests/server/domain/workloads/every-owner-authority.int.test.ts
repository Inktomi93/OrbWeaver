// @subject packages/server/src/domain/workloads/engine/runner.ts
// @subject packages/server/src/domain/workloads/verbs/estimate-model-calls.ts
// @subject packages/server/src/domain/discovery/persistence/embed-store-reads.ts
// @subject packages/server/src/domain/discovery/persistence/card-reads.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { characterEmbeddings, characterSummaries, characters, embedGenerations, themeClusters, users, workloads } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { DomainNotFoundError } from "@orb/kit/errors";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { runWorkload } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCorpusConnections, seedRecallCorpus } from "@orb/testkit/node/composed";
import { eq, inArray, sql } from "drizzle-orm";
import { vi } from "vitest";
import { createQueueScanner, executeAdmitted, observeQueued, physicalWire, QUEUE_OBSERVATION_DELAY_MS } from "./funding.fixtures.ts";

test("only actual NULL-owner execution carries every-owner authority, independently of a null caller", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  for (const principal of [owner, member]) {
    await seedCorpusConnections(root, principal);
    for (const suffix of ["first", "second"]) {
      await root.services.character.create({
        principal,
        input: createCharacterSchema.parse({
          name: suffix,
          handle: suffix,
          description: `Private writing for ${principal.userId}, ${suffix}.`,
        }),
      });
    }
    await root.app.embeddings.embedCorpus({ ownerId: principal.userId, force: true, signal: new AbortController().signal });
  }
  await root.settleBackground();
  const storedGenerations = new Map((await root.db.select().from(embedGenerations)).map((row) => [row.id, row.ownerId]));
  const storedCharacters = new Map((await root.db.select().from(characters)).map((row) => [row.id, row.ownerId]));
  for (const vector of await root.db.select().from(characterEmbeddings)) {
    expect(storedGenerations.get(vector.generationId)).toBe(storedCharacters.get(vector.characterId));
  }
  for (const principal of [owner, member]) {
    expect(await root.services.discovery.computeDuplicatePairs({ ownerId: principal.userId })).toMatchObject({ charactersScanned: 2, pairsWritten: 1 });
  }
  const run = vi.spyOn(root.app.workloadContributions.csls, "run");
  const input = { kind: "csls", params: {} } satisfies StartWorkloadInput;
  const owned = await root.services.workloads.start({ caller: null, funderUserId: null, mode: "singular", ownerId: member.userId, input });
  await executeAdmitted(root, owned.id);
  expect(run.mock.calls.at(-1)?.[0]).toMatchObject({ ownerId: member.userId, userId: member.userId, everyOwnerRun: null });
  const storedOwned = await root.services.workloads.get({ caller: member, id: owned.id });
  expect(storedOwned).toMatchObject({ ownerId: member.userId, status: "succeeded", result: { scanned: 2, written: 2 } });
  const foreign = await root.db
    .select({ score: characterEmbeddings.hubScore })
    .from(characterEmbeddings)
    .innerJoin(characters, eq(characters.id, characterEmbeddings.characterId))
    .where(eq(characters.ownerId, owner.userId));
  expect(foreign.map((row) => row.score)).toEqual([null, null]);

  const beforeProvider = [...wire.requests];
  const audience = new AbortController();
  const ownerTick = root.app.liveBuses.user.subscribeUserEvents(owner.userId, audience.signal)[Symbol.asyncIterator]().next();
  const memberTick = root.app.liveBuses.user.subscribeUserEvents(member.userId, audience.signal)[Symbol.asyncIterator]().next();
  const bulk = await root.services.workloads.start({ caller: owner, mode: "bulk", ownerId: owner.userId, input });
  try {
    await executeAdmitted(root, bulk.id);
    expect(await ownerTick).toEqual({ done: false, value: { type: "corpusRecomputed" } });
    expect(await memberTick).toEqual({ done: false, value: { type: "corpusRecomputed" } });
  } finally {
    audience.abort();
  }
  const context = run.mock.calls.at(-1)?.[0];
  expect(context?.ownerId).toBeNull();
  expect(context?.everyOwnerRun).toBeDefined();
  expect(context?.everyOwnerRun).not.toBeNull();
  expect(Object.isFrozen(context?.everyOwnerRun)).toBe(true);
  expect(context?.userId).not.toBe(owner.userId);
  expect(await root.services.workloads.get({ caller: owner, id: bulk.id })).toMatchObject({
    ownerId: null,
    status: "succeeded",
    result: { scanned: 4, written: 4 },
  });
  expect(wire.requests).toEqual(beforeProvider);
  const scores = await root.db.select({ score: characterEmbeddings.hubScore }).from(characterEmbeddings);
  expect(scores.map((row) => row.score)).toEqual([1, 1, 1, 1]);
  const systemBulk = await root.services.workloads.start({ caller: null, funderUserId: null, mode: "bulk", ownerId: member.userId, input });
  await executeAdmitted(root, systemBulk.id);
  expect(run.mock.calls.at(-1)?.[0]).toMatchObject({ ownerId: null });
  expect(run.mock.calls.at(-1)?.[0].everyOwnerRun).not.toBeNull();
  run.mockRestore();
});

test("exact estimates remain count-only and owner/mode admission refuses ordinary callers before effects", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const adminId = (await root.actor()).id;
  await root.services.admin.setRole({ principal: owner, userId: adminId, role: "admin" });
  const admin = await root.principalFor(adminId);
  await seedCorpusConnections(root, owner);
  const owned = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({
      name: "Owned writing",
      handle: "owned-writing",
      description: "A real paragraph.",
    }),
  });
  await root.services.character.create({
    principal: member,
    input: createCharacterSchema.parse({
      name: "Foreign writing",
      handle: "foreign-writing",
      description: "Another private paragraph.",
    }),
  });
  await root.services.character.create({ principal: member, input: createCharacterSchema.parse({ name: "Name only", handle: "name-only", description: "" }) });
  await root.settleBackground();
  const ownerCaller = await root.internalCallerFor(owner.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const adminCaller = await root.internalCallerFor(admin.userId);
  const input = { kind: "distill-characters", params: {} } satisfies StartWorkloadInput;
  const before = [...wire.requests];
  const beforeJobs = await root.db.select().from(workloads);
  expect(await ownerCaller.workloads.estimateModelCalls({ input, mode: "bulk" })).toEqual({ calls: 2 });
  expect(await memberCaller.workloads.estimateModelCalls({ input, mode: "singular" })).toEqual({ calls: 1 });
  await expect(memberCaller.workloads.estimateModelCalls({ input, mode: "bulk" })).rejects.toThrow();
  await expect(memberCaller.workloads.start({ input, mode: "bulk" })).rejects.toThrow();
  await expect(adminCaller.workloads.estimateModelCalls({ input, mode: "bulk" })).rejects.toThrow();
  await expect(adminCaller.workloads.start({ input, mode: "bulk" })).rejects.toThrow();
  expect(await root.db.select().from(workloads)).toEqual(beforeJobs);
  expect(await root.db.select().from(characterSummaries)).toEqual([]);
  expect(wire.requests).toEqual(before);

  const estimate = await ownerCaller.workloads.estimateModelCalls({ input, mode: "singular" });
  const ref = await root.services.workloads.start({ caller: owner, mode: "singular", ownerId: null, input });
  await executeAdmitted(root, ref.id);
  const job = await root.services.workloads.get({ caller: owner, id: ref.id });
  expect(job).toMatchObject({ ownerId: owner.userId, status: "succeeded", result: { scanned: estimate.calls, written: estimate.calls } });
  expect(await root.db.select({ id: characterSummaries.characterId }).from(characterSummaries)).toEqual([{ id: owned.id }]);
  expect(await root.services.workloads.estimateRetryModelCalls({ caller: owner, id: ref.id })).toEqual(estimate);
  await expect(root.services.workloads.estimateRetryModelCalls({ caller: member, id: ref.id })).rejects.toThrow();

  const bulk = await root.services.workloads.start({ caller: owner, mode: "bulk", ownerId: owner.userId, input });
  expect(await root.services.workloads.estimateRetryModelCalls({ caller: owner, id: bulk.id })).toEqual({ calls: 2 });
  expect(await root.services.workloads.get({ caller: admin, id: bulk.id })).toMatchObject({ ownerId: null, mode: "bulk" });
  await expect(root.services.workloads.estimateRetryModelCalls({ caller: admin, id: bulk.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(root.services.workloads.retry({ caller: admin, id: bulk.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(root.services.workloads.estimateRetryModelCalls({ caller: member, id: bulk.id })).rejects.toThrow();
});

test("an admitted owner binding funds the actual bulk distill independently of its synthetic actor", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, owner);
  const card = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({
      name: "Bulk funding subject",
      handle: "bulk-funding-subject",
      description: "A genuine authored paragraph.",
    }),
  });
  await root.settleBackground();
  const ref = await root.services.workloads.start({ caller: owner, mode: "bulk", ownerId: owner.userId, input: { kind: "distill-characters", params: {} } });
  const before = [...wire.requests];
  await executeAdmitted(root, ref.id);
  const job = await root.services.workloads.get({ caller: owner, id: ref.id });
  expect(job).toMatchObject({ ownerId: null, status: "succeeded", result: { scanned: 1, written: 1 } });
  expect(wire.requests.length).toBeGreaterThan(before.length);
  expect(
    await root.db
      .select()
      .from(characterSummaries)
      .where(inArray(characterSummaries.characterId, [card.id])),
  ).toMatchObject([{ characterId: card.id }]);
});

test("theme estimates use the same seeded clustering as real owned execution without writes or provider effects", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const connections = await seedCorpusConnections(root, owner);
  const recall = await seedRecallCorpus(root, {
    chatConnectionId: connections.text.id,
    embedConnectionId: connections.embed.id,
    summarizeConnectionId: connections.text.id,
  });
  const caller = await root.internalCallerFor(owner.userId);
  for (let index = 0; index < 16; index += 1) {
    await caller.chat.commitMessage({
      chatId: recall.chatId,
      timeZone: UTC_TIME_ZONE,
      content: `Another authored scene ${index}: the loom preserves a different witness.`,
    });
  }
  const memory = await root.services.workloads.start({
    caller: owner,
    mode: "singular",
    ownerId: owner.userId,
    input: { kind: "memory-backfill", params: {} },
  });
  await executeAdmitted(root, memory.id);
  const input = { kind: "compute-themes", params: { k: 1 } } satisfies StartWorkloadInput;
  const before = [...wire.requests];
  const prior = await root.db.select().from(themeClusters);
  const estimate = await caller.workloads.estimateModelCalls({ input, mode: "singular" });
  expect(estimate.calls).toBeGreaterThan(0);
  expect(await caller.workloads.estimateModelCalls({ input, mode: "bulk" })).toEqual(estimate);
  expect(await root.db.select().from(themeClusters)).toEqual(prior);
  expect(wire.requests).toEqual(before);
  const ref = await root.services.workloads.start({ caller: owner, mode: "singular", ownerId: owner.userId, input });
  await executeAdmitted(root, ref.id);
  const job = await root.services.workloads.get({ caller: owner, id: ref.id });
  expect(job.status).toBe("succeeded");
  const written = await root.db.select().from(themeClusters).where(eq(themeClusters.ownerId, owner.userId));
  expect(written.filter((row) => row.name !== null).length).toBe(estimate.calls);
  const bulk = await root.services.workloads.start({ caller: owner, mode: "bulk", ownerId: owner.userId, input });
  await executeAdmitted(root, bulk.id);
  expect(await root.services.workloads.get({ caller: owner, id: bulk.id })).toMatchObject({ status: "succeeded", funderUserId: owner.userId });
  const bulkWritten = await root.db.select().from(themeClusters).where(eq(themeClusters.ownerId, owner.userId));
  expect(bulkWritten.filter((row) => row.name !== null).length).toBe(estimate.calls);
});

test("a deleted owner's admitted job never upgrades into every-owner execution or a retry", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  await seedCorpusConnections(root, owner);
  for (const name of ["one", "two"]) {
    await root.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ name, handle: name, description: `Real paragraph ${name}.` }),
    });
  }
  await root.app.embeddings.embedCorpus({ ownerId: owner.userId, force: true, signal: new AbortController().signal });
  await root.settleBackground();
  const ref = await root.services.workloads.start({
    caller: member,
    mode: "singular",
    ownerId: member.userId,
    scheduledAt: root.clock.now() + QUEUE_OBSERVATION_DELAY_MS,
    input: { kind: "csls", params: {} },
  });
  await observeQueued(root, ref.id);
  await root.db.delete(users).where(eq(users.id, member.userId));
  const retained = await root.db.select().from(workloads).where(eq(workloads.id, ref.id)).get();
  expect(retained).toMatchObject({ ownerId: null, admissionSystem: false, status: "queued" });
  const run = vi.spyOn(root.app.workloadContributions.csls, "run");
  await executeAdmitted(root, ref.id);
  const scores = await root.db.select({ score: characterEmbeddings.hubScore }).from(characterEmbeddings);
  expect(scores.map((row) => row.score)).toEqual([null, null]);
  expect(run).not.toHaveBeenCalled();
  expect(await createQueueScanner(root)(root.clock.now() + QUEUE_OBSERVATION_DELAY_MS, "sweep")).toBeNull();
  expect(await root.services.workloads.get({ caller: owner, id: ref.id })).toMatchObject({ status: "failed" });
  await root.db
    .update(workloads)
    .set({ params: sql`${"{"}` })
    .where(eq(workloads.id, ref.id));
  await expect(root.services.workloads.retry({ caller: owner, id: ref.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(root.services.workloads.retry({ caller: null, id: ref.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(root.services.workloads.estimateRetryModelCalls({ caller: owner, id: ref.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  run.mockRestore();
});

test("owner deletion between queue observation and atomic claim cannot upgrade a captured owned row", async () => {
  await using root = await createServerHarness();
  const member = await root.principalFor((await root.actor()).id);
  await root.settleBackground();
  const ref = await root.services.workloads.start({
    caller: member,
    mode: "singular",
    ownerId: member.userId,
    scheduledAt: root.clock.now() + QUEUE_OBSERVATION_DELAY_MS,
    input: { kind: "csls", params: {} },
  });
  const captured = await observeQueued(root, ref.id);
  expect(captured.id).toBe(ref.id);
  await root.db.delete(users).where(eq(users.id, member.userId));
  const run = vi.spyOn(root.app.workloadContributions.csls, "run");
  await runWorkload(
    {
      db: databaseHandle(root.db),
      contributions: root.app.workloadContributions,
      audit: root.app.audit,
      now: root.clock.now,
      emitEvent: root.app.workloadEvents.emitWorkloadEvent,
      heartbeatMs: 0,
      cancelPollMs: 0,
      scheduleInterval: root.timers.interval,
    },
    captured,
    new AbortController().signal,
  );
  expect(run).not.toHaveBeenCalled();
  expect(await createQueueScanner(root)(root.clock.now() + QUEUE_OBSERVATION_DELAY_MS, "sweep")).toBeNull();
  expect(await root.services.workloads.get({ caller: null, id: ref.id })).toMatchObject({ status: "failed" });
  run.mockRestore();
});
