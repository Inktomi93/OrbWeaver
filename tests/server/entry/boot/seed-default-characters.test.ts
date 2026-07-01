// entry/boot/seed-default-characters — the boot step drives the composition-root seeder for the deployment
// owner. Isolates the boot WIRING (the seam-test precedent): a fake seeder records the principal it was
// driven with; the seeder's own idempotency/conflict behavior is covered in domain/character/seeder.

import type { Principal } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DefaultCharacterSeeder } from "@orb/server/domain/character";
import { seedDefaultCharacters } from "@orb/server/entry/boot";
import { expect, test } from "../../../support/fixtures";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};

test("drives the seeder's ensureSeeded for the deployment owner", async () => {
  const calls: Principal[] = [];
  const seeder: DefaultCharacterSeeder = {
    ensureSeeded: (principal): Promise<void> => {
      calls.push(principal);
      return Promise.resolve();
    },
  };

  await seedDefaultCharacters({ seeder, owner: OWNER });

  expect(calls).toEqual([OWNER]);
});
