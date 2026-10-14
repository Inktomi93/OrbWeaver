// @subject packages/server/src/domain/notifications/substrate/actionable.ts
// @subject packages/server/src/domain/notifications/verbs/list.ts
// @subject packages/server/src/domain/notifications/verbs/replay-since.ts
import type { InboxView } from "@orb/contracts/notifications";
import { closeDb } from "@orb/db";
import { freshCountedDb } from "@orb/testkit/node/db.ts";
import type { Fixtures } from "@orb/testkit/node/fixtures.ts";
import { test as base, expect } from "../_fixtures.ts";

const test = base.extend<{ counted: Awaited<ReturnType<typeof freshCountedDb>> } & Pick<Fixtures, "db">>({
  counted: async ({}, use): Promise<void> => {
    await using lifetime = new AsyncDisposableStack();
    const counted = await freshCountedDb();
    lifetime.defer(() => closeDb(counted.db));
    await use(counted);
  },
  db: async ({ counted }, use): Promise<void> => {
    await use(counted.db);
  },
});

test("names the invite and nomination ids, deduped, and nothing else", async ({
  harness,
  notificationActors: actors,
  notificationDecisions: decisions,
  consentSnapshots: consent,
  counted,
}) => {
  const svc = harness.services.notifications;
  const host = actors.host;
  const other = await harness.services.chat.createInvite({ principal: host, chatId: actors.room.id, input: { invitedHandle: actors.alice.handle } });
  const first = await svc.record({ event: actors.aliceInvite });
  const duplicate = await svc.record({ event: actors.aliceInvite });
  await svc.record({ event: decisions.nomination });
  await svc.record({ event: decisions.nomination });
  await svc.record({ event: consent.large });
  await svc.record({ event: decisions.kicked });
  counted.queries.reset();
  const page = await svc.list({ principal: actors.alice });
  expect(page.items.filter((row) => row.payload.type === "invite").map((row) => row.payload)).toEqual([
    actors.aliceInvite,
    actors.aliceInvite,
    expect.objectContaining({ inviteId: other.invite.id }),
  ]);
  expect(page.items.filter((row) => row.id === first.id || row.id === duplicate.id).map((row) => row.actionable)).toEqual([true, true]);
  const inviteSql = counted.queries.statements().filter((statement) => statement.includes('from "chat_invites"'));
  const nominationSql = counted.queries.statements().filter((statement) => statement.includes('from "chats"'));
  expect(inviteSql).toHaveLength(1);
  expect(nominationSql).toHaveLength(1);
  expect(inviteSql[0]?.match(/"chat_invites"\."id" in \(([^)]+)\)/u)?.[1]?.match(/\?/gu)).toHaveLength(2);
  expect(nominationSql[0]?.match(/"chats"\."id" in \(([^)]+)\)/u)?.[1]?.match(/\?/gu)).toHaveLength(1);
});
test("a page of consent + informational rows asks NOTHING — no round trip is owed", async ({
  harness,
  notificationActors: actors,
  consentSnapshots: consent,
  notificationDecisions: decisions,
  counted,
}) => {
  await harness.services.notifications.record({ event: consent.large });
  await harness.services.notifications.record({ event: decisions.kicked });
  counted.queries.reset();
  const page = await harness.services.notifications.list({ principal: actors.alice });
  expect(page.items.map((row) => row.actionable)).toEqual([false, true]);
  expect(counted.queries.statements().filter((statement) => /from "(?:chat_invites|chats)"/u.test(statement))).toEqual([]);
  await harness.services.notifications.record({ event: actors.aliceInvite });
  counted.queries.reset();
  expect((await harness.services.notifications.list({ principal: actors.alice })).items[0]?.actionable).toBe(true);
  expect(counted.queries.statements().filter((statement) => statement.includes('from "chat_invites"'))).toHaveLength(1);
});
test("a decision the chat domain still holds open is actionable; one it does not is NOT", async ({ harness, notificationActors: actors }) => {
  const host = actors.host;
  const settled = await harness.services.chat.createInvite({ principal: host, chatId: actors.room.id, input: { invitedHandle: actors.alice.handle } });
  await harness.services.chat.declineInvite({ principal: actors.alice, inviteId: settled.invite.id });
  await harness.services.notifications.record({ event: actors.aliceInvite });
  const page = await harness.services.notifications.list({ principal: actors.alice });
  expect(page.items.map((row) => [row.payload.type === "invite" ? row.payload.inviteId : null, row.actionable])).toEqual([
    [actors.aliceInvite.inviteId, true],
    [settled.invite.id, false],
  ]);
});
test("a nomination follows its chat; an informational row is never actionable", async ({
  harness,
  notificationActors: actors,
  notificationDecisions: decisions,
}) => {
  const nomination = await harness.services.notifications.record({ event: decisions.nomination });
  await harness.services.notifications.record({ event: decisions.kicked });
  expect((await harness.services.notifications.list({ principal: actors.alice })).items.map((row) => row.actionable)).toEqual([false, true]);
  await harness.services.chat.nominateHostHandoff({ principal: decisions.host, chatId: decisions.room.id, userId: actors.bob.userId });
  const settled = await harness.services.notifications.list({ principal: actors.alice });
  expect(settled.items.map((row) => row.actionable)).toEqual([false, false]);
  expect(settled.items.find((row) => row.id === nomination.id)).toMatchObject({ id: nomination.id, payload: decisions.nomination, dismissedAt: null });
});
test("the standing consent ask is actionable on its own presence — no id, no lookup", async ({
  harness,
  notificationActors: actors,
  consentSnapshots: consent,
  counted,
}) => {
  const raised = await harness.services.notifications.record({ event: consent.large });
  counted.queries.reset();
  const page = await harness.services.notifications.list({ principal: actors.alice });
  expect(page.items).toEqual([raised]);
  expect(counted.queries.statements().filter((statement) => /from "(?:chat_invites|chats)"/u.test(statement))).toEqual([]);
});
test("every other field rides through untouched", async ({ harness, notificationActors: actors }) => {
  const raised = await harness.services.notifications.record({ event: actors.aliceInvite });
  expect((await harness.services.notifications.list({ principal: actors.alice })).items).toEqual([raised]);
  expect(await harness.services.notifications.replaySince({ principal: actors.alice, afterSeq: raised.seq - 1 })).toEqual([raised]);
});
test("a freshly RAISED decision-carrying row is standing; a raised notice is not", async ({
  harness,
  notificationActors: actors,
  notificationDecisions: decisions,
  consentSnapshots: consent,
}) => {
  const views: InboxView[] = [];
  for (const event of [actors.aliceInvite, decisions.nomination, consent.large, decisions.kicked]) {
    views.push(await harness.services.notifications.record({ event }));
  }
  expect(views.map((row) => row.actionable)).toEqual([true, true, true, false]);
});
test("a row that has LEFT the inbox is settled, whatever it used to ask", async ({ harness, notificationActors: actors, consentSnapshots: consent }) => {
  for (const event of [actors.aliceInvite, consent.large]) {
    const raised = await harness.services.notifications.record({ event });
    const withdrawn = await harness.services.notifications.dismiss({ principal: actors.alice, notificationId: raised.id });
    expect(withdrawn).toMatchObject({ id: raised.id, payload: event, actionable: false });
  }
  expect((await harness.services.notifications.list({ principal: actors.alice })).items).toEqual([]);
});
