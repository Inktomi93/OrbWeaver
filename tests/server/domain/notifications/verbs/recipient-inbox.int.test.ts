// @subject packages/server/src/domain/notifications/verbs/list.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts
import { describe } from "vitest";
import { expect, test } from "../_fixtures.ts";

describe("list — recipient-scope", () => {
  test("returns only the caller's own notifications", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const first = await svc.record({ event: actors.aliceInvite });
    const second = await svc.record({ event: actors.aliceInvite });
    const foreign = await svc.record({ event: actors.bobInvite });
    const alice = await svc.list({ principal: actors.alice });
    expect(alice.items.map((row) => [row.id, row.payload])).toEqual([
      [second.id, actors.aliceInvite],
      [first.id, actors.aliceInvite],
    ]);
    const bob = await svc.list({ principal: actors.bob });
    expect(bob.items.map((row) => [row.id, row.payload])).toEqual([[foreign.id, actors.bobInvite]]);
  });
});

describe("list — ordering + paging", () => {
  test("newest-first by seq; nextCursor pages the remainder, then null", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const a = await svc.record({ event: actors.aliceInvite });
    const b = await svc.record({ event: actors.aliceInvite });
    const c = await svc.record({ event: actors.aliceInvite });

    const first = await svc.list({ principal: actors.alice, limit: 2 });
    expect(first.items.map((i) => i.seq)).toEqual([c.seq, b.seq]);
    expect(first.nextCursor).toBe(b.seq);

    const cursor = first.nextCursor;
    if (cursor === null) {
      throw new Error("expected a page cursor");
    }
    const second = await svc.list({ principal: actors.alice, limit: 2, cursor });
    expect(second.items.map((i) => i.seq)).toEqual([a.seq]);
    expect(second.nextCursor).toBeNull();
  });

  test("dismissed notifications are excluded", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const a = await svc.record({ event: actors.aliceInvite });
    await svc.record({ event: actors.aliceInvite });
    await svc.dismiss({ principal: actors.alice, notificationId: a.id });
    const page = await svc.list({ principal: actors.alice });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).not.toBe(a.id);
  });
});

describe("list — actionable (#1799)", () => {
  test("an invite the chat domain still holds open is actionable; a settled one is not, with the row unmoved", async ({
    harness,
    notificationActors: actors,
  }) => {
    const svc = harness.services.notifications;
    const host = actors.host;
    const settled = await harness.services.chat.createInvite({ principal: host, chatId: actors.room.id, input: { invitedHandle: actors.alice.handle } });
    const settledPage = await svc.list({ principal: actors.alice });
    const [settledView] = settledPage.items.filter((item) => item.payload.type === "invite" && item.payload.inviteId === settled.invite.id);
    if (settledView === undefined) {
      throw new Error("actual settled invite has no delivery");
    }
    await harness.services.chat.declineInvite({ principal: actors.alice, inviteId: settled.invite.id });
    await svc.record({ event: actors.aliceInvite });

    const page = await svc.list({ principal: actors.alice });

    expect(page.items.map((i) => i.actionable)).toEqual([true, false]);
    expect(page.items.filter((item) => item.id === settledView.id)).toMatchObject([{ id: settledView.id, payload: settledView.payload, dismissedAt: null }]);
  });

  test("an informational row is never actionable", async ({ harness, notificationActors: actors, notificationDecisions: decisions }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: decisions.kicked });
    const page = await svc.list({ principal: actors.alice });
    expect(page.items[0]?.actionable).toBe(false);
  });

  test("the RESUME wire agrees with the list wire, row for row", async ({ harness, notificationActors: actors, notificationDecisions: decisions }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: actors.aliceInvite });
    await svc.record({ event: decisions.kicked });

    const listed = await svc.list({ principal: actors.alice });
    const resumed = await svc.replaySince({ principal: actors.alice, afterSeq: 0 });

    expect(new Map(listed.items.map((i) => [i.id, i.actionable]))).toEqual(new Map(resumed.map((i) => [i.id, i.actionable])));
    expect([...resumed].map((i) => i.actionable)).toEqual([true, false]);
  });
});
