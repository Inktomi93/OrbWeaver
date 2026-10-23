// @subject packages/server/src/domain/connection/verbs/local-light-policy.ts
// @subject packages/server/src/domain/sessions/persistence/users.ts

import { connectionBindings, userConnections, users } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { castId } from "@orb/kit/ids";
import { seedLocalLightOnBoot } from "@orb/server/entry/boot";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

test("boot continues across a real binding refusal, and the composed post-boot account mint survives and repairs its own floor", async ({
  db,
  app,
  clock,
  harness,
}) => {
  const first = await harness.actor();
  const second = await harness.actor({ enabled: false });
  const bound: string[] = [];
  const deps = {
    db: databaseHandle(db),
    now: (): number => clock.now(),
    idSource: harness.idSource,
    onEmbedSpaceBound: (id: string): void => {
      bound.push(id);
    },
  };
  await using refusal = await refuseWrites(db, { table: connectionBindings, event: "INSERT", message: "binding refused" });
  expect(await seedLocalLightOnBoot(deps)).toBe(0);
  for (const user of [first, second]) {
    expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, user.id))).toHaveLength(2);
  }
  expect(bound).toEqual([]);
  const minted = await app.services.sessions.ensureUser(castId("after_boot_refusal"));
  expect(await db.select().from(users).where(eq(users.id, minted))).toHaveLength(1);
  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, minted))).toHaveLength(2);
  expect(await db.select().from(connectionBindings).where(eq(connectionBindings.userId, minted))).toEqual([]);
  await refusal.lift();
  await app.seedUserConnections(minted);
  const repaired = await db.select().from(connectionBindings).where(eq(connectionBindings.userId, minted));
  expect(new Set(repaired.map((row) => row.task))).toEqual(new Set(["embed", "imageEmbed", "rerank"]));
  expect(repaired.every((row) => row.userId === minted && row.actorKind === "user")).toBe(true);
  expect(await seedLocalLightOnBoot(deps)).toBe(0);
  expect(new Set(bound)).toEqual(new Set([first.id, second.id]));
});
