// @subject packages/server/src/entry/compose/databank.ts
import { createGetDatabankSettings } from "@orb/server/domain/settings";
import { expect, test } from "@orb/testkit/node";
import { principal } from "@orb/testkit/node/helpers";

test("databank settings remain owner-isolated and live while excluding the chat-only slot budget", async ({ harness, services }) => {
  const owner = await harness.actor();
  const other = await harness.actor();
  const read = createGetDatabankSettings((userId) => services.settings.loadUserSettings(userId));
  const otherBefore = await read(other.id);
  await services.settings.updateUserSettingsSection({
    principal: await principal(harness, owner.id),
    input: { section: "databank", patch: { chunk: { chunkSize: 1200 }, retrieval: { k: 3, minScore: 0.4, rerank: true }, slotTokenBudget: 2048 } },
  });
  expect(await read(owner.id)).toEqual({ chunk: expect.objectContaining({ chunkSize: 1200 }), retrieval: { k: 3, minScore: 0.4, rerank: true } });
  expect(await read(owner.id)).not.toHaveProperty("slotTokenBudget");
  expect(await read(other.id)).toEqual(otherBefore);
  await services.settings.updateUserSettingsSection({
    principal: await principal(harness, owner.id),
    input: { section: "databank", patch: { chunk: { chunkSize: 700 } } },
  });
  expect((await read(owner.id)).chunk.chunkSize).toBe(700);
});
