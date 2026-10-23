// These row-derived callers exercise production authorization, not request authentication.
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { tags } from "@orb/db";
import { fetchOwned } from "@orb/db/query";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "@orb/testkit/node/fixtures.ts";

test("fetchOwned and its composed read door refuse a foreign tag without revealing its existence", async ({ db, ownerCaller, otherCaller }) => {
  const tag = await ownerCaller.tag.createTag({ input: { name: "Owner-read private tag" } });
  expect(await fetchOwned(db, tags, tag.id, OWNER_USER_ID)).toMatchObject({ id: tag.id, name: tag.name });
  expect(await fetchOwned(db, tags, tag.id, OTHER_USER_ID)).toBeUndefined();
  expect(await ownerCaller.tag.listAttachedEntities({ tagId: tag.id, targetType: "character" })).toEqual({ entities: [], hasMore: false });
  await expect(otherCaller.tag.listAttachedEntities({ tagId: tag.id, targetType: "character" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("room membership refuses both a stranger and an app administrator outside the room", async ({ ownerCaller, otherCaller, adminCaller }) => {
  const { chat } = await ownerCaller.chat.startChat({ characterIds: [] });
  expect(await ownerCaller.chat.getChat({ chatId: chat.id })).toMatchObject({ id: chat.id, viewerIsHost: true });
  await expect(otherCaller.chat.getChat({ chatId: chat.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(adminCaller.chat.getChat({ chatId: chat.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("post-fetch workloads preserve ordinary ownership, admin access and trusted system access", async ({ harness, otherCaller, adminCaller, services }) => {
  const stranger = await harness.internalCallerFor((await harness.actor()).id);
  const workload = await otherCaller.workloads.start({
    input: { kind: "reconcile-stats", params: {} },
    mode: "singular",
    scheduledAt: harness.clock.now() + CADENCE_INTERVAL_MS.daily,
  });
  const owned = await otherCaller.workloads.get({ id: workload.id });
  expect(owned).toMatchObject({ id: workload.id, ownerId: OTHER_USER_ID, status: "queued" });
  await expect(stranger.workloads.get({ id: workload.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await adminCaller.workloads.get({ id: workload.id })).toEqual(owned);
  expect(await services.workloads.get({ id: workload.id, caller: null })).toEqual(owned);
});
