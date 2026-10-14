import "@orb/testkit/node/composed-real.ts";
import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import { seedChat } from "@orb/testkit/node/factories/chat.ts";
import { test as base } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";

interface NotificationActors {
  readonly alice: Principal;
  readonly bob: Principal;
  readonly room: Awaited<ReturnType<typeof seedChat>>;
  readonly aliceInvite: Extract<NotificationEvent, { readonly type: "invite" }>;
  readonly bobInvite: Extract<NotificationEvent, { readonly type: "invite" }>;
}

// Capture the real targeted-invite producer, then clear its delivery without settling the invite.
async function recipientInvite(
  harness: ServerTestHarness,
  host: Principal,
  room: NotificationActors["room"],
  principal: Principal,
): Promise<NotificationActors["aliceInvite"]> {
  const made = await harness.services.chat.createInvite({ principal: host, chatId: room.id, input: { invitedHandle: principal.handle } });
  const page = await harness.services.notifications.list({ principal });
  const raised = page.items.find((item) => item.payload.type === "invite" && item.payload.inviteId === made.invite.id);
  if (raised === undefined || raised.payload.type !== "invite") {
    throw new Error("the production targeted invite did not deliver its notification");
  }
  await harness.services.notifications.markAllRead({ principal });
  await harness.services.notifications.dismiss({ principal, notificationId: raised.id });
  return raised.payload;
}

export const test = base.extend<{ notificationActors: NotificationActors }>({
  notificationActors: async ({ harness }, use): Promise<void> => {
    const alice = await harness.principalFor((await harness.actor()).id);
    const bob = await harness.principalFor((await harness.actor()).id);
    const room = await seedChat(harness.db, { withHost: true }, harness.idSource);
    if (room.hostUserId === undefined) {
      throw new Error("the canonical room seed omitted its requested host");
    }
    const host = await harness.principalFor(room.hostUserId);
    const aliceInvite = await recipientInvite(harness, host, room, alice);
    const bobInvite = await recipientInvite(harness, host, room, bob);
    await use({ alice, bob, room, aliceInvite, bobInvite });
  },
});

export { expect } from "@orb/testkit/node/fixtures.ts";
