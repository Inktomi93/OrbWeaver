// @subject packages/server/src/domain/sessions/persistence/users.ts
import { createListSeedAccountIds } from "@orb/server/domain/sessions";
import { expect, test } from "@orb/testkit/node";
import { bootGrantFor } from "@orb/testkit/node/helpers";

test("the boot seed's account list enumerates every account, disabled ones included", async ({ harness, services }) => {
  const enabled = await harness.actor();
  const disabled = await harness.actor();
  await services.admin.setEnabled({ principal: await harness.principalFor(harness.ownerId), userId: disabled.id, enabled: false });
  expect((await createListSeedAccountIds(bootGrantFor(harness.db))()).toSorted()).toEqual([harness.ownerId, enabled.id, disabled.id].toSorted());
});
