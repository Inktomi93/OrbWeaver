// Consent settlement must reach the notification room after the durable grant write, without rebadging.
import "../../../support/composed-real.ts";
import type { InboxView } from "@orb/contracts/notifications";
import type { StreamFrame } from "@orb/contracts/stream";
import type { SocketId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginView } from "@orb/server/domain/plugin";
import { publishNotification } from "@orb/server/transport/trpc";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "../../../support/fixtures.ts";
import { makeBundle, ownerPrincipalFor } from "../../domain/plugin/_support.ts";
import { consumeServerReady } from "../../transport/trpc/stream/_support.ts";

function notificationFrame(result: IteratorResult<unknown>): Extract<StreamFrame, { channel: "notifications" }> {
  const frame = (Array.isArray(result.value) ? result.value[1] : result.value) as StreamFrame;
  if (frame.channel !== "notifications") {
    throw new Error(`expected notifications, got ${frame.channel}`);
  }
  return frame;
}

test("approval corrections and final settlement reach the live room behind a newer notification", async ({ services, ownerCaller, otherCaller }) => {
  const caller = ownerPrincipalFor(OWNER_USER_ID);
  await otherCaller.notifications.list({});
  const rows: PluginView[] = [];
  for (const slug of ["first", "second", "third"]) {
    const row = await services.plugin.install({ caller, bundle: makeBundle({ id: slug, capabilities: ["chat.read"] }), grant: [] });
    await services.plugin.setGrant({ caller, pluginId: row.id, grant: [], acknowledgedNetHosts: [] });
    rows.push(row);
  }
  const [firstRow, secondRow, thirdRow] = rows;
  if (firstRow === undefined || secondRow === undefined || thirdRow === undefined) {
    throw new Error("three pending plugins must be installed");
  }
  await ownerCaller.notifications.markAllRead();
  const standing = (await ownerCaller.notifications.list({})).items[0];
  expect(standing?.payload).toMatchObject({ type: "plugins-awaiting-consent", pendingCount: 3 });

  const socketId = castId<SocketId>("consent_socket");
  await ownerCaller.stream.attach({ socketId, ref: { channel: "notifications" } });
  const socket = await ownerCaller.stream.connect({ socketId });
  const iterator = socket[Symbol.asyncIterator]();
  try {
    await consumeServerReady(iterator);
    await iterator.next();
    const first = iterator.next();
    await services.plugin.setGrant({ caller, pluginId: firstRow.id, grant: ["chat.read"], acknowledgedNetHosts: [] });
    const corrected = notificationFrame(await first);
    expect(corrected.event).toMatchObject({ id: standing?.id, seq: standing?.seq, readAt: standing?.readAt, actionable: true });
    expect(corrected.event.payload).toMatchObject({ pendingCount: 2 });

    const notice = (): Promise<InboxView> =>
      services.notifications.record({
        event: { type: "plugin-disabled", recipientUserId: OWNER_USER_ID, pluginId: firstRow.id },
      });
    const newer = await notice();
    const next = iterator.next();
    publishNotification(newer);
    expect(notificationFrame(await next).event.id).toBe(newer.id);

    const update = iterator.next();
    await services.plugin.setGrant({ caller, pluginId: secondRow.id, grant: ["chat.read"], acknowledgedNetHosts: [] });
    const sentinel = await notice();
    publishNotification(sentinel);
    const shrunk = notificationFrame(await update);
    expect(shrunk.event).toMatchObject({ id: standing?.id, seq: standing?.seq, readAt: standing?.readAt, actionable: true });
    expect(shrunk.event.payload).toMatchObject({ pendingCount: 1 });
    expect(shrunk.seq).toBe(newer.seq);
    expect(notificationFrame(await iterator.next()).event.id).toBe(sentinel.id);

    const settlement = iterator.next();
    await services.plugin.setGrant({ caller, pluginId: thirdRow.id, grant: ["chat.read"], acknowledgedNetHosts: [] });
    const terminalSentinel = await notice();
    publishNotification(terminalSentinel);
    const settled = notificationFrame(await settlement);
    expect(settled.event).toMatchObject({ id: standing?.id, seq: standing?.seq, actionable: false });
    expect(settled.event.dismissedAt).not.toBeNull();
    expect(settled.seq).toBe(sentinel.seq);
    expect(notificationFrame(await iterator.next()).event.id).toBe(terminalSentinel.id);
    const inbox = await ownerCaller.notifications.list({});
    expect(inbox.items.map((row) => row.id)).toEqual([terminalSentinel.id, sentinel.id, newer.id]);
    expect(inbox.items.every((row) => row.readAt === null)).toBe(true);

    const foreign = iterator.next();
    publishNotification(
      await services.notifications.record({
        event: { type: "plugins-awaiting-consent", recipientUserId: OTHER_USER_ID, pendingCount: 10 },
      }),
      true,
    );
    const own = await notice();
    publishNotification(own);
    expect(notificationFrame(await foreign).event.id).toBe(own.id);
  } finally {
    await iterator.return?.(undefined);
  }
});
