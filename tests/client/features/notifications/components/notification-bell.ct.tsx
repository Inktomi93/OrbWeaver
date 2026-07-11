// CT: the topbar notifications bell (features/notifications — the multi-human invites lane). Drives
// the PRODUCTION path over the stubbed network: `notifications.list` (the durable inbox read) + the
// `notifications.notifications` SSE subscription (a scripted `text/event-stream` body in the exact
// tRPC wire shape — the routeChatStream pattern, local here because that helper types its events as
// `ChatBusEvent`) + the invite verbs. Asserts: the unread badge + accessible name; open→markRead; the
// inline Accept (fires `invites.acceptInvite` with the notification's `inviteId`, then dismisses);
// Decline→`declineInvite`+dismiss; and a LIVE arrival re-rendering the list without a refresh.
//
// The bell button is addressed by ROLE + accessible name (its aria-label carries the unread count) —
// deliberate: the name IS the a11y contract (see the component header for why no testid rides it).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { NotificationBellStory } from "../_ct-stories";

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

/** SSE frames in the tRPC wire shape (route-trpc-subscription.ts, retyped for InboxView payloads). */
function sseBody(events: readonly Record<string, unknown>[]): string {
  const frames = ["event: connected\ndata: {}\n\n"];
  for (const [i, event] of events.entries()) {
    frames.push(`data: ${JSON.stringify(event)}\nid: ${String(i + 1)}\n\n`);
  }
  return frames.join("");
}

/** Serve the notifications subscription a scripted stream; everything else falls back to routeTrpc.
 *  Register AFTER routeTrpc (later routes run first; non-SSE requests fall through). */
async function routeInboxStream(
  page: Page,
  events: readonly Record<string, unknown>[],
): Promise<void> {
  let served = false;
  await page.route("**/api/trpc/**", async (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    if (!accept.includes("text/event-stream")) {
      await route.fallback();
      return;
    }
    // First subscribe gets the script; a reconnect gets a bare connected frame (no replay).
    const body = served ? sseBody([]) : sseBody(events);
    served = true;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body,
    });
  });
}

test("unread invites badge the bell; opening lists the invite and marks it read", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markRead": () => null,
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);

  // The accessible name carries the unread count (the badge is aria-hidden decoration).
  const bell = page.getByRole("button", { name: "Notifications (1 unread)" });
  await expect(bell).toBeVisible();

  await bell.click();
  await expect(page.getByText("alex invited you to a chat")).toBeVisible();
  // Opening = seen: the unread row is marked read.
  await expect.poll(() => trpc.count("notifications.markRead")).toBeGreaterThanOrEqual(1);
  const marked = trpc.lastInput("notifications.markRead") as { notificationId?: unknown };
  expect(marked.notificationId).toBe("ntf_ct_1");
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

test("Accept fires acceptInvite with the notification's inviteId, then dismisses the row", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markRead": () => null,
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

  await expect.poll(() => trpc.count("invites.acceptInvite")).toBeGreaterThanOrEqual(1);
  const accepted = trpc.lastInput("invites.acceptInvite") as { inviteId?: unknown };
  expect(accepted.inviteId).toBe("chatinvite_ct_1");
  // Acting on the invite clears its inbox row.
  await expect.poll(() => trpc.count("notifications.dismiss")).toBeGreaterThanOrEqual(1);
  const dismissed = trpc.lastInput("notifications.dismiss") as { notificationId?: unknown };
  expect(dismissed.notificationId).toBe("ntf_ct_1");
});

test("Decline fires declineInvite + dismisses; the row leaves the inbox on refetch", async ({
  mount,
  page,
}) => {
  // Keyed off the DISMISS (not a call counter): the open-marks-read settle ALSO refetches the list,
  // and a counter-keyed stub would empty the inbox before Decline is ever clicked (observed flake —
  // the row detached mid-click).
  let dismissed = false;
  const trpc = await routeTrpc(page, {
    "notifications.list": () =>
      dismissed ? { items: [], nextCursor: null } : { items: [inviteRow()], nextCursor: null },
    "notifications.markRead": () => null,
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

  await expect.poll(() => trpc.count("invites.declineInvite")).toBeGreaterThanOrEqual(1);
  const declined = trpc.lastInput("invites.declineInvite") as { inviteId?: unknown };
  expect(declined.inviteId).toBe("chatinvite_ct_1");
  await expect.poll(() => trpc.count("notifications.dismiss")).toBeGreaterThanOrEqual(1);
  // The invalidate refetched the (now empty) inbox — the row is gone without a reload.
  await expect(page.getByText("alex invited you to a chat")).toHaveCount(0);
});

test("a LIVE invite arrival re-renders the badge without a refresh (the SSE-driven invalidate)", async ({
  mount,
  page,
}) => {
  let listCalls = 0;
  await routeTrpc(page, {
    "notifications.list": () => {
      listCalls += 1;
      // The first read (before the stream delivers) is empty; the stream-driven refetch finds the row.
      return listCalls === 1
        ? { items: [], nextCursor: null }
        : { items: [inviteRow()], nextCursor: null };
    },
  });
  await routeInboxStream(page, [inviteRow()]);

  await mount(<NotificationBellStory />);

  // The scripted stream frame lands → onData invalidates → the refetch surfaces the unread badge.
  await expect(page.getByRole("button", { name: "Notifications (1 unread)" })).toBeVisible();
});
