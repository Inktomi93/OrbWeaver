// notifications.notifications — the PD-23 per-user durable inbox subscription (core/Tier-4-Transport.md). The
// load-bearing property: on RECONNECT (a `lastEventId`) it replays the durable rows with `seq > lastEventId`
// from the inbox `list` (DURABLE-FIRST), ascending, BEFORE attaching the live bus. Driven through the real
// ladder via `createCaller` (authed). The live bus is module state; the test takes only the durable yields
// then tears the stream down.

import type { ChatId, NotificationId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { InboxView, NotificationsService } from "@orb/server/domain/notifications";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const RECIPIENT = castId<UserId>("user_recipient");

function inboxView(seq: number): InboxView {
  return {
    id: castId<NotificationId>(`notification_${seq}`),
    type: "kicked",
    payload: { type: "kicked", recipientUserId: RECIPIENT, chatId: castId<ChatId>("chat_1") },
    seq,
    readAt: null,
    dismissedAt: null,
    createdAt: 0,
  };
}

// Unwrap a yielded subscription value — `tracked()` yields `[id, data, symbol]`; data is at index 1.
function dataOf(yielded: unknown): InboxView {
  const value = Array.isArray(yielded) ? yielded[1] : yielded;
  return value as InboxView;
}

describe("notifications subscription — durable-first resume", () => {
  test("replays durable rows newer than lastEventId, ascending, before going live", async () => {
    // Newest-first page (the inbox `list` contract); only seq 6 and 7 are newer than lastEventId 5.
    const list = vi.fn<NotificationsService["list"]>(async () => ({
      items: [inboxView(7), inboxView(6), inboxView(5), inboxView(4)],
      nextCursor: 4,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: RECIPIENT }),
      services: { notifications: { list } },
    });

    const sub = await caller(ctx).notifications.notifications({ lastEventId: "5" });
    const iterator = sub[Symbol.asyncIterator]();
    const first = await iterator.next();
    const second = await iterator.next();
    await iterator.return?.(undefined);

    // Durable replay happened (the inbox table was read for the resume) …
    expect(list).toHaveBeenCalled();
    // … and the missed events replay ASCENDING (6 then 7), durable-first.
    expect(dataOf(first.value).seq).toBe(6);
    expect(dataOf(second.value).seq).toBe(7);
  });
});
