// A deleted owner's job keeps admissionSystem false after its owner clears to null, so it never becomes every-owner work.
// No verb deletes a user or writes unreadable params, so both states are planted directly.
// @subject packages/server/src/domain/workloads/engine/runner.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { characterEmbeddings, users, workloads } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { DomainNotFoundError } from "@orb/kit/errors";
import { runWorkload } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCorpusConnections } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { vi } from "vitest";
import { createQueueScanner, executeAdmitted, observeQueued, physicalWire, QUEUE_OBSERVATION_DELAY_MS } from "../funding.fixtures.ts";

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
