// @subject packages/server/src/domain/workloads/verbs/start.ts
// @subject packages/server/src/domain/workloads/verbs/retry.ts
// @subject packages/server/src/domain/workloads/verbs/estimate-model-calls.ts
// @subject packages/server/src/domain/workloads/engine/schedule-tick.ts
// @subject packages/server/src/domain/workloads/engine/runner.ts
// @subject packages/server/src/domain/workloads/persistence/queries.ts
// @subject packages/server/src/domain/discovery/workload-contributions.ts
// @subject packages/server/src/domain/refinery/workload-contributions.ts
// @subject packages/server/src/domain/chat/memory/generate/segments.ts
// @subject packages/server/src/domain/chat/substrate/backfill.ts
// @subject packages/server/src/domain/chat/workload-contributions.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { CADENCE_INTERVAL_MS, WORKLOAD_UNFUNDED } from "@orb/contracts/workloads";
import { characterSummaries, characters, chatDigests, chatSegments, closeDb, embeddingCalls, embedGenerations, users } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { DomainNotFoundError } from "@orb/kit/errors";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { tickWorkloadSchedules } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { CORPUS_EMBEDDING_VECTOR, createServerHarness, freshDb, freshHeldDb, seedCorpusConnections, seedRecallRoom } from "@orb/testkit/node/composed";
import { and, eq, inArray } from "drizzle-orm";
import type { HostedFundingRoom } from "./funding.fixtures.ts";
import { executeAdmitted, executeRow, observeQueued, physicalWire, QUEUE_OBSERVATION_DELAY_MS, WORKLOAD_FUNDER_HEADER } from "./funding.fixtures.ts";

const DISTILL = { kind: "distill-characters", params: {} } satisfies StartWorkloadInput;

async function fundedOwner(root: ServerTestHarness, principal: Principal): Promise<Awaited<ReturnType<typeof seedCorpusConnections>>> {
  const rows = await seedCorpusConnections(root, principal);
  await root.services.connection.update({
    principal,
    connectionId: rows.text.id,
    patch: { transport: { headers: { [WORKLOAD_FUNDER_HEADER]: principal.userId } } },
  });
  return rows;
}

async function card(root: ServerTestHarness, principal: Principal): Promise<Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>> {
  return await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({
      name: "Funding subject",
      handle: "funding-subject",
      description: "An authored paragraph about a traveller repairing the orbital loom.",
    }),
  });
}

test("restart and a different retry caller preserve admitted funding and owned enumeration", async () => {
  const db = await freshDb();
  await using lifetime = new AsyncDisposableStack();
  lifetime.defer(() => closeDb(db));
  const wire = physicalWire();
  const root = await createServerHarness({ db, providerFetch: wire.execute });
  lifetime.defer(() => root[Symbol.asyncDispose]());
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  await fundedOwner(root, owner);
  await fundedOwner(root, member);
  const ownCard = await card(root, member);
  await card(root, owner);
  await root.settleBackground();
  const ref = await root.services.workloads.start({ caller: member, ownerId: null, mode: "singular", input: DISTILL });
  await root[Symbol.asyncDispose]();
  await using resumed = await createServerHarness({ db, ownerId: owner.userId, clock: root.clock, ids: root.ids, providerFetch: wire.execute });
  const before = wire.funders.length;
  expect(await resumed.services.workloads.estimateRetryModelCalls({ caller: owner, id: ref.id })).toEqual({ calls: 1 });
  expect(wire.funders).toHaveLength(before);
  await executeAdmitted(resumed, ref.id);
  const retry = await resumed.services.workloads.retry({ caller: owner, id: ref.id });
  expect(await resumed.services.workloads.get({ caller: owner, id: retry.id })).toMatchObject({ ownerId: member.userId, funderUserId: member.userId });
  await executeAdmitted(resumed, retry.id);
  expect(wire.funders.slice(before)).toEqual([member.userId, member.userId]);
  expect(await db.select({ id: characterSummaries.characterId }).from(characterSummaries)).toEqual([{ id: ownCard.id }]);
});

test("owned distill delivers only admitted tenant bytes to the real provider boundary", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  await fundedOwner(root, member);
  const allowedText = "The authorized tenant repairs the orbital loom.";
  const foreignText = "The excluded tenant guards an unrelated private ledger.";
  const allowed = await root.services.character.create({
    principal: member,
    input: createCharacterSchema.parse({ name: "Allowed", handle: "allowed", description: allowedText }),
  });
  await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Excluded", handle: "excluded", description: foreignText }),
  });
  await root.settleBackground();
  const before = wire.bodies.length;
  const ref = await root.services.workloads.start({ caller: member, ownerId: null, mode: "singular", input: DISTILL });
  await executeAdmitted(root, ref.id);
  const delivered = wire.bodies.slice(before).join("\n");
  expect(delivered).toContain(allowedText);
  expect(delivered).not.toContain(foreignText);
  expect(await root.db.select({ id: characterSummaries.characterId }).from(characterSummaries)).toEqual([{ id: allowed.id }]);
});

test("unfunded system paid jobs and their retries never borrow the saved owner binding", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: Buffer.alloc(32, 1) });
  const owner = await root.principalFor(root.ownerId);
  await fundedOwner(root, owner);
  const subject = await card(root, owner);
  await root.settleBackground();
  const ref = await root.services.workloads.start({ caller: null, funderUserId: null, ownerId: owner.userId, mode: "bulk", input: DISTILL });
  const before = [...wire.requests];
  await expect(root.services.workloads.estimateRetryModelCalls({ caller: owner, id: ref.id })).rejects.toMatchObject({ code: WORKLOAD_UNFUNDED });
  await executeAdmitted(root, ref.id);
  expect(await root.services.workloads.get({ caller: owner, id: ref.id })).toMatchObject({ status: "failed", funderUserId: null });
  const retry = await root.services.workloads.retry({ caller: owner, id: ref.id });
  await executeAdmitted(root, retry.id);
  expect(await root.services.workloads.get({ caller: owner, id: retry.id })).toMatchObject({ status: "failed", funderUserId: null, ownerId: null });
  expect(wire.requests).toEqual(before);
  expect(await root.db.select().from(characterSummaries)).toEqual([]);
  const admitted = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "bulk", input: DISTILL });
  await executeAdmitted(root, admitted.id);
  expect(wire.funders.at(-1)).toBe(owner.userId);
  expect(await root.db.select({ id: characterSummaries.characterId }).from(characterSummaries)).toEqual([{ id: subject.id }]);
});

test("atomic claim reads cleared funding instead of the captured queue observation", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: Buffer.alloc(32, 1) });
  const owner = await root.principalFor(root.ownerId);
  const funder = await root.principalFor((await root.actor()).id);
  await fundedOwner(root, owner);
  await fundedOwner(root, funder);
  await card(root, owner);
  await root.settleBackground();
  const ref = await root.services.workloads.start({
    caller: null,
    funderUserId: funder.userId,
    ownerId: null,
    mode: "bulk",
    input: DISTILL,
    scheduledAt: root.clock.now() + QUEUE_OBSERVATION_DELAY_MS,
  });
  const captured = await observeQueued(root, ref.id);
  expect(captured.funderUserId).toBe(funder.userId);
  await root.db.delete(users).where(eq(users.id, funder.userId));
  const before = [...wire.requests];
  await executeRow(root, captured);
  expect(await root.services.workloads.get({ caller: owner, id: ref.id })).toMatchObject({ status: "failed", ownerId: null, funderUserId: null });
  expect(wire.requests).toEqual(before);
  expect(await root.db.select().from(characterSummaries)).toEqual([]);
});

test("retry refuses a funder deleted after its read without persisting another job", async () => {
  const held = await freshHeldDb();
  await using lifetime = new AsyncDisposableStack();
  lifetime.defer(() => closeDb(held.db));
  await using root = await createServerHarness({ db: held.db });
  const owner = await root.principalFor(root.ownerId);
  const funder = await root.principalFor((await root.actor()).id);
  const original = await root.services.workloads.start({ caller: null, funderUserId: funder.userId, ownerId: owner.userId, mode: "singular", input: DISTILL });
  await root.services.workloads.cancel({ caller: owner, id: original.id });
  const before = await root.services.workloads.list({ caller: owner, kind: "distill-characters" });
  const gate = held.hold(/insert into "workloads"/u);
  const retry = root.services.workloads.retry({ caller: owner, id: original.id });
  const refusal = (async (): Promise<void> => {
    await expect(retry).rejects.toBeInstanceOf(DomainNotFoundError);
  })();
  try {
    await gate.reached;
    await root.db.delete(users).where(eq(users.id, funder.userId));
  } finally {
    gate.release();
  }
  await refusal;
  expect(await root.services.workloads.list({ caller: owner, kind: "distill-characters" })).toEqual(before.map((row) => ({ ...row, funderUserId: null })));
});

test("a bulk schedule persists its owner's funding through the trusted tick and disable stops new admission", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: Buffer.alloc(32, 1) });
  const owner = await root.principalFor(root.ownerId);
  await fundedOwner(root, owner);
  await card(root, owner);
  await root.settleBackground();
  const schedule = await root.services.workloads.createSchedule({ caller: owner, ownerId: owner.userId, mode: "bulk", cadence: "daily", input: DISTILL });
  root.clock.advance(CADENCE_INTERVAL_MS.daily);
  const tick = { db: databaseHandle(root.db), now: root.clock.now, start: root.services.workloads.start };
  await tickWorkloadSchedules(tick);
  const due = await root.services.workloads.list({ caller: owner, kind: "distill-characters" });
  expect(due).toHaveLength(1);
  const ref = due[0];
  if (ref === undefined) {
    throw new Error("schedule did not admit its workload");
  }
  expect(ref).toMatchObject({ ownerId: null, funderUserId: owner.userId });
  await executeAdmitted(root, ref.id);
  expect(wire.funders.at(-1)).toBe(owner.userId);
  await root.services.workloads.setScheduleEnabled({ caller: owner, id: schedule.id, enabled: false });
  root.clock.advance(CADENCE_INTERVAL_MS.daily);
  await tickWorkloadSchedules(tick);
  expect(await root.services.workloads.list({ caller: owner, kind: "distill-characters" })).toHaveLength(1);
});

for (const withdrawal of ["consent", "credential"] as const) {
  test(`queued paid work honors current ${withdrawal} withdrawal without foreign fallback`, async () => {
    const wire = physicalWire();
    await using root = await createServerHarness({ providerFetch: wire.execute, secretBoxKey: Buffer.alloc(32, 1) });
    const owner = await root.principalFor(root.ownerId);
    const member = await root.principalFor((await root.actor()).id);
    const connections = await fundedOwner(root, owner);
    await fundedOwner(root, member);
    await card(root, owner);
    const credential = await root.services.credentials.add({
      principal: owner,
      provider: "custom-openai",
      key: "workload-funding-test-key",
      metadata: { auth: "endpoint" },
    });
    await root.services.connection.update({ principal: owner, connectionId: connections.text.id, patch: { credentialId: credential.id } });
    await root.settleBackground();
    const allowed = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "bulk", input: DISTILL });
    await executeAdmitted(root, allowed.id);
    expect(await root.services.workloads.get({ caller: owner, id: allowed.id })).toMatchObject({ status: "succeeded" });
    const queued = await root.services.workloads.retry({ caller: owner, id: allowed.id });
    if (withdrawal === "consent") {
      await root.services.connection.update({ principal: owner, connectionId: connections.text.id, patch: { allowBackground: false } });
    } else {
      await root.services.credentials.markRevokedByUser({ principal: owner, credentialId: credential.id });
    }
    const before = [...wire.funders];
    await executeAdmitted(root, queued.id);
    expect(await root.services.workloads.get({ caller: owner, id: queued.id })).toMatchObject({ status: "failed", funderUserId: owner.userId });
    expect(wire.funders).toEqual(before);
  });
}

test("bulk memory uses admitted Utility funding but each room host's encoder window and accounting", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  await fundedOwner(root, owner);
  await root.services.connection.setBinding({ principal: owner, task: "embed", connectionId: null });
  const ownerCaller = await root.internalCallerFor(owner.userId);
  await ownerCaller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", maxTier: 0 } } });
  const hosts = [await root.principalFor((await root.actor()).id), await root.principalFor((await root.actor()).id)];
  const rooms: HostedFundingRoom[] = [];
  for (const [index, host] of hosts.entries()) {
    const connections = await fundedOwner(root, host);
    await root.services.connection.update({
      principal: host,
      connectionId: connections.embed.id,
      patch: { declared: { ...connections.embed.declared, embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: index === 0 ? 256 : 8192 } } },
    });
    const caller = await root.internalCallerFor(host.userId);
    await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
    const chatId = await seedRecallRoom(caller);
    rooms.push({ chatId, host, connectionId: connections.embed.id });
    for (let seq = 0; seq < 16; seq += 1) {
      await caller.chat.commitMessage({
        chatId,
        timeZone: UTC_TIME_ZONE,
        content: `Hosted scene ${seq}: ${"The traveller repairs the orbital loom and preserves each witness. ".repeat(16)}`,
      });
    }
  }
  await root.settleBackground();
  const before = wire.funders.length;
  const ref = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "bulk", input: { kind: "memory-backfill", params: {} } });
  await executeAdmitted(root, ref.id);
  const job = await root.services.workloads.get({ caller: owner, id: ref.id });
  expect(job).toMatchObject({ status: "succeeded", funderUserId: owner.userId });
  const utilityFunders = wire.funders.slice(before);
  expect(utilityFunders.length).toBeGreaterThan(0);
  expect(new Set(utilityFunders)).toEqual(new Set([owner.userId]));
  const generationOwners = new Map((await root.db.select().from(embedGenerations)).map((generation) => [generation.id, generation.ownerId]));
  const chunkCounts: number[] = [];
  for (const room of rooms) {
    const segments = await root.db.select().from(chatSegments).where(eq(chatSegments.chatId, room.chatId));
    const digests = await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, room.chatId));
    expect(segments.length).toBeGreaterThan(0);
    expect(digests.length).toBeGreaterThan(0);
    expect(new Set([...segments, ...digests].map((row) => generationOwners.get(row.generationId)))).toEqual(new Set([room.host.userId]));
    chunkCounts.push(segments.length);
    const accounting = await root.db
      .select()
      .from(embeddingCalls)
      .where(and(eq(embeddingCalls.connectionId, room.connectionId), eq(embeddingCalls.ownerId, room.host.userId)));
    expect(accounting.length).toBeGreaterThan(0);
  }
  expect(chunkCounts[0]).toBeGreaterThan(chunkCounts[1] ?? 0);
  expect(await root.db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, owner.userId))).toEqual([]);
  const storedDigests = await root.db
    .select()
    .from(chatDigests)
    .where(
      inArray(
        chatDigests.chatId,
        rooms.map((room) => room.chatId),
      ),
    );
  const beforeSegmentsOnly = wire.funders.length;
  const segmentsOnly = await root.services.workloads.start({
    caller: null,
    funderUserId: null,
    ownerId: null,
    mode: "bulk",
    input: { kind: "memory-backfill", params: { segmentsOnly: true } },
  });
  await executeAdmitted(root, segmentsOnly.id);
  expect(await root.services.workloads.get({ caller: owner, id: segmentsOnly.id })).toMatchObject({ status: "succeeded", funderUserId: null });
  expect(wire.funders).toHaveLength(beforeSegmentsOnly);
  expect(
    await root.db
      .select()
      .from(chatDigests)
      .where(
        inArray(
          chatDigests.chatId,
          rooms.map((room) => room.chatId),
        ),
      ),
  ).toEqual(storedDigests);
  const firstRoom = rooms[0];
  if (firstRoom === undefined) {
    throw new Error("hosted memory corpus has no room");
  }
  const caller = await root.internalCallerFor(firstRoom.host.userId);
  for (let seq = 0; seq < 8; seq += 1) {
    await caller.chat.commitMessage({
      chatId: firstRoom.chatId,
      timeZone: UTC_TIME_ZONE,
      content: `Another witnessed scene ${seq}: the ledger preserves a new fact.`,
    });
  }
  await root.services.connection.setBinding({ principal: owner, task: "summarize", connectionId: null });
  const owned = await root.services.workloads.start({
    caller: firstRoom.host,
    ownerId: firstRoom.host.userId,
    mode: "singular",
    input: { kind: "memory-backfill", params: {} },
  });
  const quote = await root.services.workloads.estimateRetryModelCalls({ caller: owner, id: owned.id });
  expect(quote.calls).toBeGreaterThan(0);
  expect(await root.services.workloads.estimateRetryModelCalls({ caller: firstRoom.host, id: owned.id })).toEqual(quote);
  const beforeAutomatic = wire.funders.length;
  await root.app.enqueueEmbedReindex(null);
  const automatic = (await root.services.workloads.list({ caller: owner, kind: "memory-backfill" }))[0];
  if (automatic === undefined) {
    throw new Error("automatic reindex admitted no memory work");
  }
  expect(automatic).toMatchObject({ ownerId: null, funderUserId: null, params: { segmentsOnly: true, embedderChanged: true } });
  await executeAdmitted(root, automatic.id);
  expect(await root.services.workloads.get({ caller: owner, id: automatic.id })).toMatchObject({ status: "succeeded" });
  expect(wire.funders).toHaveLength(beforeAutomatic);
});

test("a bulk refinery score spends the admitted funder and stamps each target without editing authored content", async () => {
  const wire = physicalWire();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  await fundedOwner(root, owner);
  await fundedOwner(root, member);
  const subjects = [await card(root, owner), await card(root, member)];
  await root.settleBackground();
  const before = wire.funders.length;
  const ref = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "bulk", input: { kind: "refine-score-sweep", params: {} } });
  await executeAdmitted(root, ref.id);
  expect(await root.services.workloads.get({ caller: owner, id: ref.id })).toMatchObject({ status: "succeeded", result: { scanned: 2, scored: 2, failed: 0 } });
  expect(wire.funders.slice(before)).toEqual([owner.userId, owner.userId]);
  const stored = await root.db
    .select()
    .from(characters)
    .where(
      inArray(
        characters.id,
        subjects.map((subject) => subject.id),
      ),
    );
  expect(stored.map((row) => row.refinery?.score)).toEqual([7, 7]);
  expect(new Set(stored.map((row) => row.description))).toEqual(new Set(["An authored paragraph about a traveller repairing the orbital loom."]));
});
