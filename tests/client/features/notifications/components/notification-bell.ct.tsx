// CT: the topbar notifications bell (features/notifications — the multi-human invites lane). Drives
// the PRODUCTION path over the stubbed network: `notifications.list` (the durable inbox read) + the
// `notifications` ROOM on the tab's ONE multiplexed socket (SSE-1 S3 — `routeOrbSocket` serves the real
// `stream.connect` body and records the `stream.attach` for the room) + the invite verbs. Asserts: the
// unread badge + accessible name; open→markAllRead (ONE bulk mutation, not a per-row markRead loop); the
// inline Accept (fires `invites.acceptInvite` with the notification's `inviteId`, then dismisses);
// Decline→`declineInvite`+dismiss; a LIVE arrival re-rendering the list without a refresh; and a room-level
// server fault surfacing as a toast instead of being read as an arrival.
//
// The bell button is addressed by ROLE + accessible name (its aria-label carries the unread count) —
// deliberate: the name IS the a11y contract (see the component header for why no testid rides it).

import type { StreamFrame } from "@orb/contracts/stream";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { OrbSocketRecorder } from "../../../../support/ct/route-orb-socket";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { NotificationBellStory, NotificationBellToastStory } from "../_ct-stories";

/** One inbox row in the wire shape (`InboxView` — domain/notifications/contract/views.ts). */
function inviteRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ntf_ct_1",
    type: "invite",
    payload: {
      type: "invite",
      recipientUserId: "user_ct_invitee",
      chatId: "chat_ct_target",
      inviteId: "chatinvite_ct_1",
      invitedByHandle: "alex",
    },
    seq: 1,
    readAt: null,
    dismissedAt: null,
    createdAt: 1_750_000_000_000,
    ...overrides,
  };
}

/** One inbox row as a `notifications` FRAME on the socket — the InboxView rides verbatim under `event`, and
 *  `seq` is the durable cursor that used to be the tracked envelope id (SSE-1 §3.2/§3.3). */
function arrivalFrame(row: Record<string, unknown>): StreamFrame {
  // FABRICATION-OK: this CT stubs the NETWORK, so its rows are deliberately authored as the raw JSON wire object (`inviteRow`, which the `notifications.list` stub serves verbatim too) rather than as a typed InboxView — what the browser parses off the wire IS the fixture.
  return { channel: "notifications", seq: row["seq"], event: row } as unknown as StreamFrame;
}

/** Stub the tab's ONE socket and serve the given frames once the inbox room has attached. `awaitAttaches`
 *  is the handshake: the registry DROPS a frame for a room nobody joined (correct — the real server never
 *  sends one), so a body served before the attach would race. Register AFTER routeTrpc (later routes run
 *  first; non-socket requests fall through, including the attach mutation routeTrpc answers `null`). */
async function routeInboxStream(page: Page, frames: readonly StreamFrame[]): Promise<OrbSocketRecorder> {
  return await routeOrbSocket(page, { frames, awaitAttaches: frames.length === 0 ? 0 : 1 });
}

test("unread invites badge the bell; opening lists the invite and marks it read", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);

  // The accessible name carries the unread count (the badge is aria-hidden decoration).
  const bell = page.getByRole("button", { name: "Notifications (1 unread)" });
  await expect(bell).toBeVisible();

  await bell.click();
  await expect(page.getByText("alex invited you to a chat")).toBeVisible();
  // Opening = seen: ONE bulk markAllRead call, not a per-row markRead loop.
  await expect.poll(() => trpc.count("notifications.markAllRead"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => trpc.count("notifications.markAllRead")).toBe(1);
});

test("no unread → plain label, empty inbox copy", async ({ mount, page }) => {
  await routeTrpc(page, {
    "notifications.list": () => ({ items: [], nextCursor: null }),
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);

  const bell = page.getByRole("button", { name: "Notifications", exact: true });
  await bell.click();
  await expect(page.getByText("No notifications.")).toBeVisible();
});

test("Accept fires acceptInvite with the notification's inviteId, then dismisses the row", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
    "notifications.dismiss": () => null,
    "invites.acceptInvite": () => ({
      chat: { id: "chat_ct_target", participants: [] },
      participant: { id: "participant_ct_new" },
    }),
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);
  await page.getByRole("button", { name: "Notifications (1 unread)" }).click();
  await page.getByRole("button", { name: "Accept" }).click();

  await expect.poll(() => trpc.count("invites.acceptInvite"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const accepted = trpc.lastInput("invites.acceptInvite") as { inviteId?: unknown };
  expect(accepted.inviteId).toBe("chatinvite_ct_1");
  // Acting on the invite clears its inbox row.
  await expect.poll(() => trpc.count("notifications.dismiss"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const dismissed = trpc.lastInput("notifications.dismiss") as { notificationId?: unknown };
  expect(dismissed.notificationId).toBe("ntf_ct_1");
});

test("Decline fires declineInvite + dismisses; the row leaves the inbox on refetch", async ({ mount, page }) => {
  // Keyed off the DISMISS (not a call counter): the open-marks-read settle ALSO refetches the list,
  // and a counter-keyed stub would empty the inbox before Decline is ever clicked (observed flake —
  // the row detached mid-click).
  let dismissed = false;
  const trpc = await routeTrpc(page, {
    "notifications.list": () => (dismissed ? { items: [], nextCursor: null } : { items: [inviteRow()], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
    "notifications.dismiss": () => {
      dismissed = true;
      return null;
    },
    "invites.declineInvite": () => null,
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);
  await page.getByRole("button", { name: "Notifications (1 unread)" }).click();
  await page.getByRole("button", { name: "Decline" }).click();

  // The invalidate refetched the (now empty) inbox — the row is gone without a reload; this DOM
  // consequence is downstream of both the decline call and the dismiss, so await it directly.
  await expect(page.getByText("alex invited you to a chat")).toHaveCount(0);
  const declined = trpc.lastInput("invites.declineInvite") as { inviteId?: unknown };
  expect(declined.inviteId).toBe("chatinvite_ct_1");
  await expect.poll(() => trpc.count("notifications.dismiss")).toBeGreaterThanOrEqual(1);
});

test("a LIVE invite arrival re-renders the badge without a refresh (the SSE-driven invalidate)", async ({ mount, page }) => {
  let listCalls = 0;
  await routeTrpc(page, {
    "notifications.list": () => {
      listCalls += 1;
      // The first read (before the stream delivers) is empty; the stream-driven refetch finds the row.
      return listCalls === 1 ? { items: [], nextCursor: null } : { items: [inviteRow()], nextCursor: null };
    },
  });
  await routeInboxStream(page, [arrivalFrame(inviteRow())]);

  await mount(<NotificationBellStory />);

  // The scripted stream frame lands → onData invalidates → the refetch surfaces the unread badge.
  await expect(page.getByRole("button", { name: "Notifications (1 unread)" })).toBeVisible();
});

test("a typed roomFailed frame surfaces as a toast (it is NOT an arrival)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "notifications.list": () => ({ items: [], nextCursor: null }),
  });
  // The frame the socket yields when THIS room's pump throws a DomainError (here: the durable replay).
  // Before `54643a8d` the consumer took the typed fault for an inbox arrival and INVALIDATED on it — the
  // inbox looked freshly-loaded behind a stream that had just died, and the user was told nothing. The fold
  // carries that fix: a room fault is a CONTROL frame routed to the room's `onError`, so it can no longer
  // reach `onEvent` at all, and it still says so out loud.
  await routeInboxStream(page, [
    {
      channel: "control",
      type: "roomFailed",
      ref: { channel: "notifications" },
      code: "SERVICE_UNAVAILABLE",
      message: "the inbox stream failed",
    },
  ]);

  await mount(<NotificationBellToastStory />);

  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toContainText("the inbox stream failed");
  await expect(toast).toHaveAttribute("data-type", "error");
});

/** A handoff-nominated inbox row (the two-party host handoff, step 1's delivery). */
function handoffRow(): Record<string, unknown> {
  return {
    id: "ntf_ct_handoff",
    type: "handoff-nominated",
    payload: {
      type: "handoff-nominated",
      recipientUserId: "user_ct_nominee",
      chatId: "chat_ct_target",
    },
    seq: 2,
    readAt: null,
    dismissedAt: null,
    createdAt: 1_750_000_000_001,
  };
}

test("a handoff-nominated row carries Accept — fires acceptHostHandoff with the chatId, then dismisses", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "notifications.list": () => ({ items: [handoffRow()], unreadCount: 1 }),
    "notifications.markAllRead": () => null,
    "notifications.dismiss": () => null,
    "invites.acceptHostHandoff": () => null,
  });
  await routeInboxStream(page, []);

  const component = await mount(<NotificationBellStory />);
  await component.getByRole("button", { name: "Notifications (1 unread)" }).click();

  await expect(page.getByText("You've been nominated to host a chat")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();

  await expect.poll(() => trpc.count("invites.acceptHostHandoff"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const accepted = trpc.lastInput("invites.acceptHostHandoff") as { chatId?: unknown };
  expect(accepted.chatId).toBe("chat_ct_target");
  // Acting on the nomination clears its inbox row.
  await expect.poll(() => trpc.count("notifications.dismiss"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

test("the inbox rides the tab's ONE socket — one connect, one attach, zero extra connections", async ({ mount, page }) => {
  // The S3 socket-count claim, asserted on the wire. Before the fold the bell held a `notifications`
  // subscription of its own: mounting it cost a SECOND browser connection on top of the app's socket, and a
  // browser allows ~6 per origin (the 2026-08-01 starvation incident). Now it is a ROOM — one `stream.attach`
  // mutation on the batched HTTP link, which costs no connection at all.
  await routeTrpc(page, {
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
  });
  const socket = await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);
  await expect(page.getByRole("button", { name: "Notifications (1 unread)" })).toBeVisible();
  // The inbox room is attached — the barrier proving the socket did its work before the counts are read.
  await expect.poll(() => socket.attachedChannels()).toEqual(["notifications"]);

  // ONESHOT-OK: settled by the attach poll above — the attach mutation is issued strictly AFTER the
  // EventSource request the socket makes on mount, so once it is recorded every connect this mount is going
  // to make has already been counted. The inbox is a ROOM, not a second stream: exactly ONE connect.
  expect(socket.connects()).toBe(1);
});
