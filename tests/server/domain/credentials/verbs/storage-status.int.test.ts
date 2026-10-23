// @subject packages/server/src/domain/credentials/verbs/storage-status.ts
// @subject packages/server/src/transport/trpc/routers/credentials.ts
// @subject packages/contracts/src/credentials/index.ts
import { credentialStorageStatusSchema } from "@orb/contracts/credentials";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

const KEY = "storage-status-private-key";

test.for([true, false])("storage capability matches the real box and remains authenticated and strict (enabled=%j)", async (enabled) => {
  await using root = await createServerHarness({ secretBoxKey: enabled ? Buffer.alloc(32, 1) : null });
  const actor = await root.actor();
  const caller = await root.internalCallerFor(actor.id);
  const anonymous = await root.internalCallerFor(null);
  const status = await caller.credentials.storageStatus();
  expect(status).toEqual({ enabled });
  expect(credentialStorageStatusSchema.parse(status)).toEqual(status);
  await expect(anonymous.credentials.storageStatus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const corrupt = { ...status, key: KEY };
  using storageStatus = vi.spyOn(root.services.credentials, "storageStatus");
  storageStatus.mockResolvedValueOnce(corrupt);
  await expect(caller.credentials.storageStatus()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Output validation failed" });
  expect(credentialStorageStatusSchema.safeParse(corrupt).success).toBe(false);
});

test("disabled storage refuses the secret write its capability view warns about", async () => {
  await using root = await createServerHarness({ secretBoxKey: null });
  const actor = await root.actor();
  const principal = await root.principalFor(actor.id);
  const caller = await root.internalCallerFor(actor.id);
  expect(await caller.credentials.storageStatus()).toEqual({ enabled: false });
  await expect(root.services.credentials.add({ principal, provider: TEST_PROVIDER_ID, key: KEY })).rejects.toMatchObject({ code: "credentials_disabled" });
  expect(await caller.credentials.list()).toEqual([]);
});
