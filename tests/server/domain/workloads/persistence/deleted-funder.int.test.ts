// A deleted funder's foreign key clears to null (ON DELETE SET NULL); no verb deletes a user, so the row is removed directly.
// @subject packages/server/src/domain/workloads/persistence/queries.ts
// @subject packages/server/src/domain/workloads/verbs/retry.ts
import { characterSummaries, closeDb, users } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, freshHeldDb } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { card, DISTILL, executeRow, fundedOwner, observeQueued, physicalWire, QUEUE_OBSERVATION_DELAY_MS } from "../funding.fixtures.ts";

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
