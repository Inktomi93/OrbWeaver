// Wire-output builder for one inbox row (`notifications.list` item): an unread, actionable chat invite. An
// override is spread after the defaults, so a test changes the row's id, cursor or read state and keeps the rest.

import { inboxViewSchema } from "@orb/contracts/notifications";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type InboxRowWire = TrpcWireOutput<"notifications.list">["items"][number];

export function makeInboxRow(overrides: Partial<InboxRowWire> = {}): InboxRowWire {
  return {
    ...inboxViewSchema.parse({
      id: ids.next(ID_PREFIX.notification),
      type: "invite",
      payload: {
        type: "invite",
        recipientUserId: ids.next("user"),
        chatId: ids.next(ID_PREFIX.chat),
        inviteId: ids.next(ID_PREFIX.chatInvite),
        invitedByHandle: "alex",
      },
      actionable: true,
      seq: 1,
      readAt: null,
      dismissedAt: null,
      createdAt: FROZEN_AT_MS,
    }),
    ...overrides,
  };
}
