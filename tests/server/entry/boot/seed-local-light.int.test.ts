// @subject packages/server/src/entry/boot/seed-local-light.ts
// @subject packages/server/src/domain/connection/verbs/local-light-policy.ts
// @subject packages/server/src/domain/sessions/persistence/users.ts

import { connectionBindings } from "@orb/db";
import { castId } from "@orb/kit/ids";
import { seedLocalLightOnBoot } from "@orb/server/entry/boot";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";

test("boot continues across a real binding refusal, and the composed post-boot account mint survives and repairs its own floor", async ({
  db,
  app,
  clock,
  harness,
}) => {
  // Accounts whose mint-time floor lost its binding writes: the mint survives and the boot sweep repairs it.
  await using refusal = await refuseWrites(db, { table: connectionBindings, event: "INSERT", message: "binding refused" });
  const first = await harness.actor();
  const second = await harness.actor({ enabled: false });
  const bound: string[] = [];
  const deps = {
    db: bootGrantFor(db),
    logger: harness.logger,
    now: (): number => clock.now(),
    idSource: harness.idSource,
    onEmbedSpaceBound: (id: string): void => {
      bound.push(id);
    },
  };
  expect(await seedLocalLightOnBoot(deps)).toBe(0);
  for (const user of [first, second]) {
    expect(await app.services.connection.list({ principal: await harness.principalFor(user.id) })).toHaveLength(2);
  }
  expect(bound).toEqual([]);
  const minted = await app.services.sessions.ensureUser(castId("after_boot_refusal"));
  expect(await app.sessions.loadUserById(minted)).toMatchObject({ handle: "after_boot_refusal" });
  const mintedPrincipal = await harness.principalFor(minted);
  const bindingsOf = async (): Promise<NonNullable<Awaited<ReturnType<typeof app.services.connection.listBindings>>[number]["binding"]>[]> =>
    (await app.services.connection.listBindings({ principal: mintedPrincipal })).flatMap(({ binding }) => (binding === null ? [] : [binding]));
  expect(await app.services.connection.list({ principal: mintedPrincipal })).toHaveLength(2);
  expect(await bindingsOf()).toEqual([]);
  await refusal.lift();
  await app.seedUserConnections(minted);
  const repaired = await bindingsOf();
  expect(new Set(repaired.map((row) => row.task))).toEqual(new Set(["embed", "imageEmbed", "rerank"]));
  expect(repaired.every((row) => row.actorKind === "user" && row.userId === minted)).toBe(true);
  expect(await seedLocalLightOnBoot(deps)).toBe(0);
  expect(new Set(bound)).toEqual(new Set([first.id, second.id]));
});
