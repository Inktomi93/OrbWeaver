// @subject packages/server/src/domain/connection/verbs/local-light-policy.ts
// @subject packages/server/src/domain/sessions/persistence/users.ts

import { databaseHandle } from "@orb/db/wiring-driver";
import "@orb/testkit/node/composed-real.ts";
import { connectionBindings, userConnections, users } from "@orb/db";
import { castId } from "@orb/kit/ids";
import { seedLocalLightOnBoot } from "@orb/server/entry/boot";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq, sql } from "drizzle-orm";

test("boot continues across a real binding refusal, and the composed post-boot account mint survives and repairs its own floor", async ({
  db,
  app,
  clock,
  harness,
}) => {
  // Seed from the harness id source: the factory counter and the composed mint both start at 1, so ensureUser would collide with the second row's primary key.
  const first = await seedUser(db, {}, harness.idSource);
  const second = await seedUser(db, { enabled: false }, harness.idSource);
  const bound: string[] = [];
  const deps = {
    db: databaseHandle(db),
    now: (): number => clock.now(),
    onEmbedSpaceBound: (id: string): void => {
      bound.push(id);
    },
  };
  await db.run(sql`CREATE TRIGGER refuse_seed_binding BEFORE INSERT ON connection_bindings BEGIN SELECT RAISE(ABORT, 'binding refused'); END`);
  expect(await seedLocalLightOnBoot(deps)).toBe(0);
  for (const user of [first, second]) {
    expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, user.id))).toHaveLength(2);
  }
  expect(bound).toEqual([]);
  const minted = await app.services.sessions.ensureUser(castId("after_boot_refusal"));
  expect(await db.select().from(users).where(eq(users.id, minted))).toHaveLength(1);
  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, minted))).toHaveLength(2);
  expect(await db.select().from(connectionBindings).where(eq(connectionBindings.userId, minted))).toEqual([]);
  await db.run(sql`DROP TRIGGER refuse_seed_binding`);
  await app.seedUserConnections(minted);
  const repaired = await db.select().from(connectionBindings).where(eq(connectionBindings.userId, minted));
  expect(new Set(repaired.map((row) => row.task))).toEqual(new Set(["embed", "imageEmbed", "rerank"]));
  expect(repaired.every((row) => row.userId === minted && row.actorKind === "user")).toBe(true);
  expect(await seedLocalLightOnBoot(deps)).toBe(0);
  expect(new Set(bound)).toEqual(new Set([first.id, second.id]));
});
