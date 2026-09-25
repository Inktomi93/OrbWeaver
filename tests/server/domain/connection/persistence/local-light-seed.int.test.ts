// persistence: the local-light convenience seed. The idempotency is keyed `(owner_id, seed_slot)`, never the label, so a
// relabel renames rows in place — the pins here are the ones a re-run would otherwise break: a second seed for
// the same user inserts NOTHING and writes no second binding, a user who RE-POINTED one of the two tasks at
// their own row keeps that pick (the seed never overwrites a user's choice), and a user who DELETED a seeded
// row gets it back on the next seed without duplicating the other one. Every id comes from the injected
// minters, so the assertions are deterministic.

import { LOCAL_LIGHT_SEED_ROWS } from "@orb/contracts/inference";
import { connectionBindings, userConnections } from "@orb/db";
import type { ConnectionBindingId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { seedLocalLightConnections } from "../../../../../packages/server/src/domain/connection/persistence/local-light-seed.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";
import { seedUser } from "../_support.ts";

// The two seeded labels, in the order the sorted read returns them.
const SEED_LABELS: readonly string[] = LOCAL_LIGHT_SEED_ROWS.map((seed) => seed.label).toSorted((a, b) => (a < b ? -1 : 1));

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
  const seeded = await seedLocalLightConnections(seedDeps(db), owner);
  expect(seeded.inserted).toBe(2);
  expect([...seeded.boundTasks].sort(), "the seed reports the tasks it bound, so boot can schedule the sweeps").toEqual(["embed", "rerank"]);
  const rows = await db.select().from(userConnections).where(eq(userConnections.ownerId, owner));
  expect(rows.map((row) => row.label).toSorted()).toEqual(SEED_LABELS);
  expect(rows.every((row) => row.providerId === "local-light" && row.allowBackground)).toBe(true);
  const bindings = await db.select().from(connectionBindings).where(eq(connectionBindings.userId, owner));
  expect(bindings.map((row) => row.task).toSorted()).toEqual(["embed", "rerank"]);
});

test("is IDEMPOTENT — a second seed inserts nothing and writes no second binding", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, "user_a");
  await seedLocalLightConnections(seedDeps(db), owner);
  expect(await seedLocalLightConnections(seedDeps(db), owner), "a boot after the first is a no-op").toEqual({ inserted: 0, boundTasks: [] });
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
    providerId: testProviderId("custom-openai"),
    credentialId: null,
    baseUrl: "http://127.0.0.1:18703/v1",
    model: testModelId("bge-m3"),
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
  await db.delete(userConnections).where(and(eq(userConnections.ownerId, owner), eq(userConnections.label, LOCAL_LIGHT_SEED_ROWS[1].label)));
  expect((await seedLocalLightConnections(seedDeps(db, 1), owner)).inserted, "exactly the missing row comes back").toBe(1);
  const rows = await db.select().from(userConnections).where(eq(userConnections.ownerId, owner));
  expect(rows.map((row) => row.label).toSorted()).toEqual(SEED_LABELS);
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
  expect((await seedLocalLightConnections(seedDeps(db, 1), second)).inserted).toBe(2);
  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, first))).toHaveLength(2);
  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, second))).toHaveLength(2);
});

// A relabel of the seed rows must never add rows: an account seeded under earlier labels keeps its two rows and
// their bindings, and the seed renames them in place.
test("rows seeded under earlier labels converge in place: two rows, still bound, with today's labels", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, "user_a");
  const earlierLabels = ["local-light · encoder", "local-light · reranker"];
  const earlier = LOCAL_LIGHT_SEED_ROWS.map((seed, index) => ({ seed, id: castId<UserConnectionId>(`user_connection_earlier${String(index)}`) }));
  for (const [index, { seed, id }] of earlier.entries()) {
    await db.insert(userConnections).values({
      id,
      ownerId: owner,
      label: earlierLabels[index] ?? "",
      providerId: testProviderId("local-light"),
      credentialId: null,
      baseUrl: null,
      model: testModelId(seed.model),
      api: "auto",
      declared: null,
      extras: null,
      transport: null,
      modelListed: true,
      allowBackground: true,
      createdAt: FROZEN_AT_MS,
      updatedAt: FROZEN_AT_MS,
    });
    await db.insert(connectionBindings).values({
      id: castId<ConnectionBindingId>(`connection_binding_earlier${String(index)}`),
      actorKind: "user",
      userId: owner,
      ruleId: null,
      pluginId: null,
      task: seed.task,
      connectionId: id,
    });
  }

  const seeded = await seedLocalLightConnections(seedDeps(db), owner);

  expect(seeded.inserted, "no row is added beside the earlier pair").toBe(0);
  const rows = await db.select().from(userConnections).where(eq(userConnections.ownerId, owner));
  expect(new Set(rows.map((row) => row.id))).toEqual(new Set(earlier.map(({ id }) => id)));
  expect(rows.map((row) => row.label).toSorted()).toEqual(SEED_LABELS);
  const bindings = await db.select().from(connectionBindings).where(eq(connectionBindings.userId, owner));
  expect(new Set(bindings.map((row) => `${row.task}:${String(row.connectionId)}`))).toEqual(new Set(earlier.map(({ seed, id }) => `${seed.task}:${id}`)));
});

// Adoption follows the binding, never the model alone: a user's own extra row on the seed's model keeps its name.
test("a user's own unbound row on the seed's model is never adopted or renamed", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, "user_a");
  const spare = castId<UserConnectionId>("user_connection_spare");
  const [encoder] = LOCAL_LIGHT_SEED_ROWS;
  await db.insert(userConnections).values({
    id: spare,
    ownerId: owner,
    label: "my spare encoder",
    providerId: testProviderId("local-light"),
    credentialId: null,
    baseUrl: null,
    model: testModelId(encoder.model),
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelListed: true,
    allowBackground: true,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });

  expect((await seedLocalLightConnections(seedDeps(db), owner)).inserted).toBe(2);
  const kept = (await db.select().from(userConnections).where(eq(userConnections.id, spare))).at(0);
  expect(kept?.label).toBe("my spare encoder");
  expect(kept?.seedSlot).toBeNull();
});
