// persistence: the local-light convenience seed. Two users get the same two LABELS, so the idempotency is
// keyed `(owner_id, label)` — the pins here are the ones a re-run would otherwise break: a second seed for
// the same user inserts NOTHING and writes no second binding, a user who RE-POINTED one of the two tasks at
// their own row keeps that pick (the seed never overwrites a user's choice), and a user who DELETED a seeded
// row gets it back on the next seed without duplicating the other one. Every id comes from the injected
// minters, so the assertions are deterministic.

import type { ProviderId } from "@orb/contracts/inference";
import { connectionBindings, userConnections } from "@orb/db";
import type { ConnectionBindingId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { seedLocalLightConnections } from "../../../../../packages/server/src/domain/connection/persistence/local-light-seed.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

/** The injected deps. `serial` keeps ids unique across seeds in one test (the PK is global, not per owner). */
function seedDeps(db: Awaited<ReturnType<typeof freshDb>>, serial = 0): Parameters<typeof seedLocalLightConnections>[0] {
  let connections = serial * 100;
  let bindings = serial * 100;
  return {
    db,
    now: (): number => FROZEN_AT_MS,
    newConnectionId: (): UserConnectionId => {
      connections += 1;
      return castId<UserConnectionId>(`user_connection_${String(connections).padStart(6, "0")}`);
    },
    newBindingId: (): ConnectionBindingId => {
      bindings += 1;
      return castId<ConnectionBindingId>(`connection_binding_${String(bindings).padStart(6, "0")}`);
    },
  };
}

test("seeds the two vector rows plus their two `user` bindings", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, "user_a");
  expect(await seedLocalLightConnections(seedDeps(db), owner)).toBe(2);
  const rows = await db.select().from(userConnections).where(eq(userConnections.ownerId, owner));
  expect(rows.map((row) => row.label).toSorted()).toEqual(["local-light · encoder", "local-light · reranker"]);
  expect(rows.every((row) => row.providerId === "local-light" && row.allowBackground)).toBe(true);
  const bindings = await db.select().from(connectionBindings).where(eq(connectionBindings.userId, owner));
  expect(bindings.map((row) => row.task).toSorted()).toEqual(["embed", "rerank"]);
});

test("is IDEMPOTENT — a second seed inserts nothing and writes no second binding", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, "user_a");
  await seedLocalLightConnections(seedDeps(db), owner);
  expect(await seedLocalLightConnections(seedDeps(db), owner), "a boot after the first is a no-op").toBe(0);
  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, owner))).toHaveLength(2);
  expect(await db.select().from(connectionBindings).where(eq(connectionBindings.userId, owner))).toHaveLength(2);
});

test("never overwrites a task the user RE-POINTED at their own row", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, "user_a");
  await seedLocalLightConnections(seedDeps(db), owner);
  const mine = castId<UserConnectionId>("user_connection_mine");
  await db.insert(userConnections).values({
    id: mine,
    ownerId: owner,
    label: "my own embedder",
    providerId: castId<ProviderId>("custom-openai"),
    credentialId: null,
    baseUrl: "http://127.0.0.1:18703/v1",
    model: "bge-m3",
    api: "auto",
    declared: { kind: "embedding" },
    extras: null,
    transport: null,
    modelListed: true,
    allowBackground: true,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  await db
    .update(connectionBindings)
    .set({ connectionId: mine })
    .where(and(eq(connectionBindings.userId, owner), eq(connectionBindings.task, "embed")));
  await seedLocalLightConnections(seedDeps(db), owner);
  const embed = (
    await db
      .select()
      .from(connectionBindings)
      .where(and(eq(connectionBindings.userId, owner), eq(connectionBindings.task, "embed")))
  ).at(0);
  expect(embed?.connectionId, "the user's pick survives every later seed").toBe(mine);
});

test("re-seeds a row the user DELETED — and does NOT silently re-point the binding they cleared with it", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, "user_a");
  await seedLocalLightConnections(seedDeps(db), owner);
  await db.delete(userConnections).where(and(eq(userConnections.ownerId, owner), eq(userConnections.label, "local-light · reranker")));
  expect(await seedLocalLightConnections(seedDeps(db, 1), owner), "exactly the missing row comes back").toBe(1);
  const rows = await db.select().from(userConnections).where(eq(userConnections.ownerId, owner));
  expect(rows.map((row) => row.label).toSorted()).toEqual(["local-light · encoder", "local-light · reranker"]);
  // The delete SET NULL the binding, and a task that already HAS a row is never re-written: the user's
  // `rerank` reads `no-connection` until they pick from the picker, exactly like any other unset task.
  const rerank = (
    await db
      .select()
      .from(connectionBindings)
      .where(and(eq(connectionBindings.userId, owner), eq(connectionBindings.task, "rerank")))
  ).at(0);
  expect(rerank, "the binding row survives the delete").toBeDefined();
  expect(rerank?.connectionId, "a seed never re-points a task the user already holds a row for").toBeNull();
});

test("one user's seed never touches another's rows", async () => {
  const db = await freshDb();
  const first = await seedUser(db, "user_a");
  const second = await seedUser(db, "user_b");
  await seedLocalLightConnections(seedDeps(db), first);
  expect(await seedLocalLightConnections(seedDeps(db, 1), second)).toBe(2);
  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, first))).toHaveLength(2);
  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, second))).toHaveLength(2);
});
