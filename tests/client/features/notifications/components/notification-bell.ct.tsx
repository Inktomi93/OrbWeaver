// CT: the topbar notifications bell (features/notifications — the multi-human invites lane). Drives
// the PRODUCTION path over the stubbed network: `notifications.list` (the durable inbox read) + the
// `notifications` ROOM on the tab's ONE multiplexed socket (SSE-1 S3 — `routeOrbSocket` serves the real
// `stream.connect` body and records the `stream.attach` for the room) + the invite verbs. Asserts: the
// unread DOT (#1798 — a mark, never a number) + accessible name; open→markAllRead (ONE bulk mutation, not a per-row markRead loop); the
// inline Accept (fires `invites.acceptInvite` with the notification's `inviteId`, then dismisses);
// Decline→`declineInvite`+dismiss; a LIVE arrival re-rendering the list without a refresh; and a room-level
// server fault surfacing as a toast instead of being read as an arrival.
//
// The bell button is addressed by ROLE + accessible name (its aria-label carries the unread count) —
// deliberate: the name IS the a11y contract (see the component header for why no testid rides it).

import type { StreamFrame } from "@orb/contracts/stream";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { OrbSocketRecorder } from "../../../../support/ct/route-orb-socket.ts";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/ct/route-trpc.ts";
// The bus's OWN transport mutations (#649). `stream.attach` rides the BATCHED HTTP link, not the SSE leg
// (`use-orb-socket.ts:7,139` — only `stream.connect` is the subscription), so `routeOrbSocket` never answers
// it and it was riding `routeTrpc`'s lenient null in every mount here. Imported from the bus's own fixture
// module rather than re-spelled, so the two directions of this feed cannot drift apart.
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { NotificationBellDestinationStory, NotificationBellSheetStory, NotificationBellStory, NotificationBellToastStory } from "../_ct-stories.tsx";

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

/** The aggregate pending-consent row (#1041 / #924 item 2) — the fresh-boot ask, whose whole payload is a
 *  count. Same raw-wire posture as `inviteRow` above. */
function consentRow(pendingCount: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ntf_ct_consent",
    type: "plugins-awaiting-consent",
    payload: { type: "plugins-awaiting-consent", recipientUserId: "user_ct_invitee", pendingCount },
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
    ...STREAM_MUTATION_ROUTES,
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
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "notifications.list": () => ({ items: [], nextCursor: null }) });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);

  const bell = page.getByRole("button", { name: "Notifications", exact: true });
  await bell.click();
  await expect(page.getByText("No notifications.")).toBeVisible();
});

test("Accept fires acceptInvite with the notification's inviteId, then dismisses the row", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
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
  await page.getByRole("button", { name: "Accept invitation from alex" }).click();

  await expect.poll(() => trpc.count("invites.acceptInvite"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (trpc.lastInput("invites.acceptInvite") as { inviteId?: unknown }).inviteId).toBe("chatinvite_ct_1");
  // Acting on the invite clears its inbox row.
  await expect.poll(() => trpc.count("notifications.dismiss"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (trpc.lastInput("notifications.dismiss") as { notificationId?: unknown }).notificationId).toBe("ntf_ct_1");
});

test("each inbox row owns its pending action: double-click is singular while a sibling stays actionable", async ({ mount, page }) => {
  const held = trpcHold();
  const first = inviteRow();
  const second = inviteRow({
    id: "ntf_ct_2",
    payload: {
      type: "invite",
      recipientUserId: "user_ct_invitee",
      chatId: "chat_ct_second",
      inviteId: "chatinvite_ct_2",
      invitedByHandle: "mira",
    },
    seq: 2,
  });
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [first, second], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 2 }),
    "notifications.dismiss": () => null,
    "invites.acceptInvite": (input: unknown) =>
      (input as { inviteId?: string }).inviteId === "chatinvite_ct_1"
        ? held
        : { chat: { id: "chat_ct_second", participants: [] }, participant: { id: "participant_ct_second" } },
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);
  await page.getByRole("button", { name: "Notifications (2 unread)" }).click();
  const nateRow = page.locator('[data-slot="inbox-row"]').filter({ hasText: "alex invited" });
  const miraRow = page.locator('[data-slot="inbox-row"]').filter({ hasText: "mira invited" });
  const nateAccept = nateRow.getByRole("button", { name: "Accept invitation from alex" });
  const miraAccept = miraRow.getByRole("button", { name: "Accept invitation from mira" });

  await nateAccept.dblclick();
  await held.requested;
  await expect(nateAccept).toBeDisabled();
  await expect(nateRow.getByRole("status")).toHaveText("Updating invitation from alex…");
  await expect(miraRow.getByRole("status")).toHaveCount(0);
  await expect(miraAccept).toBeEnabled();
  await expect.poll(() => trpc.count("invites.acceptInvite")).toBe(1);

  await miraAccept.click();
  await expect.poll(() => trpc.count("invites.acceptInvite")).toBe(2);
  held.release({ chat: { id: "chat_ct_target", participants: [] }, participant: { id: "participant_ct_new" } });
});

test("Decline fires declineInvite + dismisses; the row leaves the inbox on refetch", async ({ mount, page }) => {
  // Keyed off the DISMISS (not a call counter): the open-marks-read settle ALSO refetches the list,
  // and a counter-keyed stub would empty the inbox before Decline is ever clicked (observed flake —
  // the row detached mid-click).
  let dismissed = false;
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
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
  await page.getByRole("button", { name: "Decline invitation from alex" }).click();

  // The invalidate refetched the (now empty) inbox — the row is gone without a reload; this DOM
  // consequence is downstream of both the decline call and the dismiss, so await it directly.
  await expect(page.getByText("alex invited you to a chat")).toHaveCount(0);
  await expect.poll(async () => (trpc.lastInput("invites.declineInvite") as { inviteId?: unknown }).inviteId).toBe("chatinvite_ct_1");
  await expect.poll(() => trpc.count("notifications.dismiss")).toBeGreaterThanOrEqual(1);
});

test("a LIVE invite arrival re-renders the badge without a refresh (the SSE-driven invalidate)", async ({ mount, page }) => {
  let listCalls = 0;
  await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => {
      listCalls += 1;
      // The first read (before the stream delivers) is empty; the stream-driven refetch finds the row.
      return listCalls === 1 ? { items: [], nextCursor: null } : { items: [inviteRow()], nextCursor: null };
    },
  });
  await routeInboxStream(page, [arrivalFrame(inviteRow())]);

  // Deterministic-race gate (same class as message-list-surface.ct.tsx's canonSettled pattern): hold the
  // EventSource response until the mount's first `notifications.list` read has rendered. Without this, the
  // scripted arrival frame can be fully processed (invalidate → second list fetch queued) before that first
  // fetch settles — TanStack Query then just marks the in-flight query stale instead of issuing a second
  // fetch, so the refetch silently never happens under heavy parallel CPU contention.
  let releaseStream: (() => void) | undefined;
  const initialSettled = new Promise<void>((resolve) => {
    releaseStream = resolve;
  });
  await page.route("**/api/trpc/**", async (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    if (accept.includes("text/event-stream")) {
      await initialSettled;
    }
    await route.fallback();
  });

  await mount(<NotificationBellStory />);

  // The initial (empty) inbox has rendered — safe to let the stream through.
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  releaseStream?.();

  // The scripted stream frame lands → onData invalidates → the refetch surfaces the unread badge.
  await expect(page.getByRole("button", { name: "Notifications (1 unread)" })).toBeVisible();
});

test("a typed roomFailed frame surfaces as a toast (it is NOT an arrival)", async ({ mount, page }) => {
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "notifications.list": () => ({ items: [], nextCursor: null }) });
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

// ── The SHEET lens (side-eye 2026-08-07) ─────────────────────────────────────────────────────────────
// The phone renders the inbox INLINE in the You sheet — no trigger, no popover, so there is no `onOpenChange`
// to hang "you looked" on. The component's own comment claimed "the same markAllRead the popover fires on
// open fires here on mount" and NOTHING fired: a phone user's unread count could never clear. And the block's
// name was a `<span>`, so in a long overflow sheet the inbox was unreachable by heading navigation.

test("the sheet lens marks the inbox read ON MOUNT — the phone has no 'open' event to hang it on", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
  });
  await routeInboxStream(page, []);

  const component = await mount(<NotificationBellSheetStory />);

  // The rows are just THERE (nothing to open) — the settled barrier for the mount-time write below.
  await expect(component.getByText("alex invited you to a chat")).toBeVisible();
  await expect.poll(() => trpc.count("notifications.markAllRead"), { intervals: [20, 50, 100] }).toBe(1);
  // …and it stays ONE: the effect is keyed on the unread BOOLEAN, so it cannot re-arm per render.
  await expect.poll(() => trpc.count("notifications.markAllRead"), { intervals: [50, 100, 200] }).toBe(1);
});

test("an ALREADY-READ inbox writes nothing on mount", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [inviteRow({ readAt: 1_750_000_000_000 })], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 0 }),
  });
  await routeInboxStream(page, []);

  const component = await mount(<NotificationBellSheetStory />);

  await expect(component.getByText("alex invited you to a chat")).toBeVisible();
  // ONESHOT-OK: the row rendering IS the landed read; the effect runs in that same commit, so a write it was going to make has already been made. A settled read of a negative.
  expect(trpc.count("notifications.markAllRead")).toBe(0);
});

test("the sheet block's name is a real HEADING, not a styled span", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
  });
  await routeInboxStream(page, []);

  const component = await mount(<NotificationBellSheetStory />);

  // §13.10 N7: a section title that is only a styled Text is invisible to the reading skeleton. The name
  // carries the unread count with the STABLE word leading (N3), so this lookup survives the count changing.
  await expect(component.getByRole("heading", { name: "Notifications" })).toBeVisible();
});

// ── THE PHONE'S INBOX IS A NAMED BLOCK, NOT A LOOSE HEADING (#1129) ──────────────────────────────────
// The sheet lens is the inbox's ONLY door at a coarse pointer (`notificationsChrome.mobile: "sheet"`), and
// it rendered its rows as bare siblings of a heading: the You sheet's two other blocks are named
// `role="group"`s ("Account and settings", "More"), so an inventory of the sheet — a landmark/group walk, or
// `snap --mobile --map`, which lists containers and controls and not headings — named every block in it
// EXCEPT the inbox, and a reader who landed on an invite row was inside nothing. The claim under test is the
// rendered CONTAINER, at the real coarse pointer the lens exists for.
test.describe("the phone's inbox block", () => {
  test.use({ viewport: { width: 320, height: 800 }, hasTouch: true });

  test("the inbox is a group named by its own heading, and the rows are inside it", async ({ mount, page }) => {
    await routeTrpc(page, {
      ...STREAM_MUTATION_ROUTES,
      "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
      "notifications.markAllRead": () => ({ markedCount: 1 }),
    });
    await routeInboxStream(page, []);

    const component = await mount(<NotificationBellSheetStory />);

    // The name leads with the STABLE word and carries the count, exactly as the bar lens's bell does.
    const inbox = component.getByRole("group", { name: "Notifications (1 unread)" });
    await expect(inbox).toBeVisible();
    // The heading that NAMES the group is inside it, and so is the row — the block is a container, not a
    // label floating above unowned content.
    await expect(inbox.getByRole("heading", { name: "Notifications (1 unread)" })).toBeVisible();
    await expect(inbox.getByText("alex invited you to a chat")).toBeVisible();
    await expect(inbox.getByRole("button", { name: "Accept invitation from alex" })).toBeVisible();
  });

  test("an empty inbox still names its block — the door exists before anything is in it", async ({ mount, page }) => {
    await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "notifications.list": () => ({ items: [], nextCursor: null }) });
    await routeInboxStream(page, []);

    const component = await mount(<NotificationBellSheetStory />);

    const inbox = component.getByRole("group", { name: "Notifications" });
    await expect(inbox).toBeVisible();
    await expect(inbox.getByText("No notifications.")).toBeVisible();
  });
});

// ── THE HANDOFF NOMINATION × ITS DISCLOSURE (#1762) ─────────────────────────────────────────────────────
// Accepting a nomination lands FOUR classes of the departing host's property in the nominee's own library —
// characters, world books, the game's GM voice and the room's REGEX SCRIPTS, which are executable transforms
// over their chats. A bare Accept disclosed none of it, so the payload now carries the frozen counts and the
// button opens a confirm that reads them out. The arms below are the whole contract: the confirm lists what
// lands, NOTHING fires until it is confirmed, cancelling fires nothing at all, and a zero offer says so.

/** A handoff-nominated inbox row (the two-party host handoff, step 1's delivery). `offer` is the nominate
 *  verb's frozen disclosure — what an accept would copy. */
function handoffRow(offer: Record<string, unknown> = { characters: 2, worldBooks: 1, regexScripts: 1, gmPreset: true }): Record<string, unknown> {
  return {
    id: "ntf_ct_handoff",
    type: "handoff-nominated",
    payload: {
      type: "handoff-nominated",
      recipientUserId: "user_ct_nominee",
      chatId: "chat_ct_target",
      offer,
    },
    seq: 2,
    readAt: null,
    dismissedAt: null,
    createdAt: 1_750_000_000_001,
  };
}

test("Accept opens a confirm that reads out what the offer copies — and fires nothing until it is confirmed", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [handoffRow()], unreadCount: 1 }),
    "notifications.markAllRead": () => null,
    "notifications.dismiss": () => null,
    "invites.acceptHostHandoff": () => null,
  });
  await routeInboxStream(page, []);

  const component = await mount(<NotificationBellStory />);
  await component.getByRole("button", { name: "Notifications (1 unread)" }).click();

  await expect(page.getByText("You've been nominated to host a chat")).toBeVisible();
  await page.getByRole("button", { name: "Accept the host handoff" }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  // Every class the accept would land, in the nominee's own terms — and the regex scripts say what they DO.
  await expect(dialog.getByText("2 characters")).toBeVisible();
  await expect(dialog.getByText("1 world book")).toBeVisible();
  await expect(dialog.getByText(/1 regex script/u)).toBeVisible();
  await expect(dialog.getByText(/runs on this chat/u)).toBeVisible();
  await expect(dialog.getByText(/GM voice/u)).toBeVisible();
  // NOTHING has fired: the disclosure is the decision point, not a receipt of one already taken. Polled
  // rather than sampled once — "still zero" is a claim about a window, not an instant.
  await expect.poll(() => trpc.count("invites.acceptHostHandoff"), { intervals: [20, 50, 100] }).toBe(0);

  await dialog.getByRole("button", { name: "Accept", exact: true }).click();

  await expect.poll(() => trpc.count("invites.acceptHostHandoff"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (trpc.lastInput("invites.acceptHostHandoff") as { chatId?: unknown }).chatId).toBe("chat_ct_target");
  // Acting on the nomination clears its inbox row.
  await expect.poll(() => trpc.count("notifications.dismiss"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
});

test("cancelling the confirm accepts nothing and dismisses nothing", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [handoffRow()], unreadCount: 1 }),
    "notifications.markAllRead": () => null,
    "notifications.dismiss": () => null,
    "invites.acceptHostHandoff": () => null,
  });
  await routeInboxStream(page, []);

  const component = await mount(<NotificationBellStory />);
  await component.getByRole("button", { name: "Notifications (1 unread)" }).click();
  await page.getByRole("button", { name: "Accept the host handoff" }).click();

  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => trpc.count("invites.acceptHostHandoff"), { intervals: [20, 50, 100] }).toBe(0);
  await expect.poll(() => trpc.count("notifications.dismiss"), { intervals: [20, 50, 100] }).toBe(0);
});

test("an offer of NOTHING says so — the confirm still runs, and it does not list an empty gift", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [handoffRow({ characters: 0, worldBooks: 0, regexScripts: 0, gmPreset: false })], unreadCount: 1 }),
    "notifications.markAllRead": () => null,
    "notifications.dismiss": () => null,
    "invites.acceptHostHandoff": () => null,
  });
  await routeInboxStream(page, []);

  const component = await mount(<NotificationBellStory />);
  await component.getByRole("button", { name: "Notifications (1 unread)" }).click();
  await page.getByRole("button", { name: "Accept the host handoff" }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText(/Nothing is copied/u)).toBeVisible();
  await expect(dialog.getByText(/regex script/u)).toBeHidden();
});

test("the inbox rides the tab's ONE socket — one connect, one attach, zero extra connections", async ({ mount, page }) => {
  // The S3 socket-count claim, asserted on the wire. Before the fold the bell held a `notifications`
  // subscription of its own: mounting it cost a SECOND browser connection on top of the app's socket, and a
  // browser allows ~6 per origin (the 2026-08-01 starvation incident). Now it is a ROOM — one `stream.attach`
  // mutation on the batched HTTP link, which costs no connection at all.
  await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
  });
  const socket = await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);
  await expect(page.getByRole("button", { name: "Notifications (1 unread)" })).toBeVisible();
  // The inbox room is attached — the barrier proving the socket did its work before the counts are read.
  await expect.poll(() => socket.attachedChannels()).toEqual(["notifications"]);

  expect(socket.connects()).toBe(1);
});

// #1501 — ACCEPT AND DISMISS ARE NOT ONE TRANSACTION. `onAccepted` sat AFTER the dismiss `await`, so when the
// dismiss failed — swallowed by `ownAction`'s catch, which is correct, the dismiss carries its own
// errorToast — the reader who HAD joined the room was left standing in the inbox they opened it from, with
// an Accept button that could only fail from then on. The join is what the navigation is a consequence of.
test("an accepted invite navigates even when the follow-up dismiss FAILS (#1501)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
    "notifications.dismiss": () => trpcError({ message: "dismiss failed" }),
    "invites.acceptInvite": () => ({ chat: { id: "chat_ct_target", participants: [] }, participant: { id: "participant_ct_new" } }),
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);
  await page.getByRole("button", { name: "Notifications (1 unread)" }).click();
  await page.getByRole("button", { name: "Accept invitation from alex" }).click();

  await expect.poll(() => trpc.count("invites.acceptInvite"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("notifications.dismiss"), { intervals: [20, 50, 100] }).toBe(1);
  // `onAccepted` closes the popover on its way to the room — the one rendered consequence of navigating.
  await expect(page.getByRole("button", { name: "Accept invitation from alex" })).toHaveCount(0);
});

// The SHEET lens has no popover to close, so it is where the row's own affordances are readable: once the
// join has happened, Accept must never be offered again (re-accepting a joined invite can only fail), and
// the Dismiss that failed must be — that IS the retry.
test("after the join lands, the row stops offering Accept and offers the failed Dismiss instead (#1501)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [inviteRow()], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
    "notifications.dismiss": () => trpcError({ message: "dismiss failed" }),
    "invites.acceptInvite": () => ({ chat: { id: "chat_ct_target", participants: [] }, participant: { id: "participant_ct_new" } }),
  });
  await routeInboxStream(page, []);

  const sheet = await mount(<NotificationBellSheetStory />);
  await sheet.getByRole("button", { name: "Accept invitation from alex" }).click();
  await expect.poll(() => trpc.count("notifications.dismiss"), { intervals: [20, 50, 100] }).toBe(1);

  await expect(sheet.getByRole("button", { name: "Accept invitation from alex" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Decline invitation from alex" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Dismiss" })).toBeVisible();
});

// ── the pending-consent ask (#1041 / #924 item 2) ────────────────────────────────────────────────────────
// THE DEFECT: nine example plugins ship installed, disabled and ungranted on a fresh boot, and nothing ever
// asked. RED-FIRST RECEIPT (2026-09-05, against `git show HEAD:` of `notification-bell.tsx` with the rest
// of the branch in place): `CT SUMMARY — FAILED · 0 passed · 3 failed`. The old bell's `ROW_COPY` has no
// `plugins-awaiting-consent` entry, so the aggregate ask had no rendering at all.

test("the pending-consent ask states how many plugins are waiting and offers a way to answer", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [consentRow(9)], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);
  await page.getByRole("button", { name: "Notifications (1 unread)" }).click();

  await expect(page.getByText("9 plugins are installed but not allowed to do anything yet")).toBeVisible();
  // The answer is given on the consent screen, so the row's own affordance is the DOOR to it…
  await expect(page.getByRole("button", { name: "Review what your plugins ask for" })).toBeVisible();
  // …and dismissing stays available: denying is real and recoverable (the plugins stay installed and
  // ungranted, and Settings → Plugins is still one click away).
  await expect(page.getByRole("button", { name: "Dismiss" })).toBeVisible();
});

test("ONE waiting plugin reads as one plugin, not '1 plugins'", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [consentRow(1)], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellStory />);
  await page.getByRole("button", { name: "Notifications (1 unread)" }).click();

  await expect(page.getByText("One plugin is installed but not allowed to do anything yet")).toBeVisible();
});

test("Review sends the shell to the Plugins group and closes the inbox", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "notifications.list": () => ({ items: [consentRow(9)], nextCursor: null }),
    "notifications.markAllRead": () => ({ markedCount: 1 }),
  });
  await routeInboxStream(page, []);

  await mount(<NotificationBellDestinationStory />);
  const destination = page.getByTestId("ct-shell-destination");
  await expect(destination).not.toHaveText("config/plugins");

  await page.getByRole("button", { name: "Notifications (1 unread)" }).click();
  await page.getByRole("button", { name: "Review what your plugins ask for" }).click();

  // THE PATH TO THE ANSWER, asserted where it actually lands: the config section, on the Plugins group —
  // whose Installed list sorts the pending rows first, which is what makes the group-level door enough.
  await expect(destination).toHaveText("config/plugins");
  // …and the popover is gone, the same close-then-navigate the invite/handoff arms perform.
  await expect(page.getByText("9 plugins are installed but not allowed to do anything yet")).toBeHidden();
});

// ── THE UNREAD MARK IS A DOT, NOT A NUMBER (#1798, owner ruling) ─────────────────────────────────────
// THE DEFECT: the trigger rendered `<Badge intent="primary" size="sm">{unreadCount}</Badge>` — a full
// status pill, the same lozenge that marks `always` on a lore entry — INLINE beside the 16px bell glyph
// inside the topbar icon button, with no corner positioning. The owner's verdict on the pill was "ugly as
// fuck". The count was never the mark's job: it is already in the button's accessible name and in the rows
// the popover lists, and the pins below are deliberately written against those RENDERED facts (a childless
// circle in the corner) rather than against the new `size="dot"` axis, so they judge the pixels and not the
// API. The mark stays `aria-hidden` in both regimes — the name is the a11y contract.
//
// RED-FIRST RECEIPT (2026-09-06 — this block run against the UNMODIFIED bell AND Badge, the rest of the
// branch in place; `CT SUMMARY — FAILED · 38 passed · 4 failed`):
//   ✘ the unread mark is a dot with no number in it (#1798)
//     expect(locator).toHaveText   Expected: ""   Received: "2"
//     …resolved to `<span data-slot="badge" data-size="sm" … class="… px-row py-field text-label …">2</span>`
//   ✘ the dot sits in the button's top-end corner … — BOTH pointer arms
//     toMatchObject   corner: false · small: false · square: false   (the pill measured 24×28)
//   ✔ no unread → no mark at all   (a FENCE, green in both regimes: it pins that the DOT did not become
//     an always-on ornament, which is the one way this fix could have regressed the zero state.)
/** The dot's whole geometric verdict, measured IN THE BROWSER from the mark outwards. One evaluate, three
 *  boxes: the relationships under test are BETWEEN them, so separate round-trips would let a re-layout land
 *  between the reads. It returns booleans plus the raw boxes, so a failure prints which claim broke AND at
 *  what pixels. Hoisted to module scope because the per-pointer describe already nests four deep. */
function markVerdict(node: Element): Record<string, unknown> {
  const host = node.closest("button");
  const svg = host?.querySelector("svg");
  if (host === null || svg === null || svg === undefined) {
    return { reachable: false };
  }
  const r = (el: Element): { x: number; y: number; w: number; h: number } => {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  };
  const dot = r(node);
  const button = r(host);
  const glyph = r(svg);
  const radius = Number.parseFloat(getComputedStyle(node).borderRadius);
  return {
    reachable: true,
    // A DOT: square, small and circular — the pill it replaced measured 24×28 here.
    square: dot.w === dot.h,
    small: dot.w <= 8,
    // `rounded-full` resolves to a huge px radius in Tailwind v4, so the circle claim is an inequality.
    circular: radius >= dot.w / 2,
    // INSIDE the control's own box on every edge — a mark hanging outside the button can be clipped by the
    // topbar and sits outside the control's own focus ring.
    insideButton: dot.x >= button.x && dot.y >= button.y && dot.x + dot.w <= button.x + button.w && dot.y + dot.h <= button.y + button.h,
    // THE TOP-END CORNER, out of the glyph's way: the whole dot is above the glyph's vertical centre and
    // past its horizontal centre, which is what makes it read as an ornament ON the bell rather than a blot
    // IN it. This is the appearance-proof substitute for a `ring-2 ring-background` halo, whose colour
    // cannot be right on all three grounds this button sits on (see the variant's note).
    corner: dot.y + dot.h <= glyph.y + glyph.h / 2 && dot.x >= glyph.x + glyph.w / 2,
    // REST-STATE RASTER: at DPR 1 every edge of the circle lands on a device pixel
    // (docs/design/integer-line-boxes.md). The DPR is asserted below, never assumed.
    dpr: window.devicePixelRatio,
    onGrid: [dot.x, dot.y, dot.w, dot.h].every((v) => Number.isInteger(v)),
    boxes: { dot, button, glyph },
  };
}

test.describe("the unread mark (#1798)", () => {
  /** Two unread rows, so a number-carrying mark would have to print "2" — the count is what is on trial. */
  async function routeTwoUnread(page: Page): Promise<void> {
    await routeTrpc(page, {
      ...STREAM_MUTATION_ROUTES,
      "notifications.list": () => ({ items: [inviteRow(), inviteRow({ id: "ntf_ct_2", seq: 2 })], nextCursor: null }),
      "notifications.markAllRead": () => ({ markedCount: 2 }),
    });
    await routeInboxStream(page, []);
  }

  test("the unread mark is a dot with no number in it (#1798)", async ({ mount, page }) => {
    await routeTwoUnread(page);
    await mount(<NotificationBellStory />);

    const bell = page.getByRole("button", { name: "Notifications (2 unread)" });
    await expect(bell).toBeVisible();
    const mark = bell.locator('[data-slot="badge"]');
    await expect(mark).toHaveCount(1);
    // THE RULING, rendered: nothing is printed inside it.
    await expect(mark).toHaveText("");
    // …and the count it used to print is still reachable — in the name, and in the rows.
    await expect(mark).toHaveAttribute("aria-hidden", "true");
  });

  test("no unread → no mark at all", async ({ mount, page }) => {
    await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "notifications.list": () => ({ items: [], nextCursor: null }) });
    await routeInboxStream(page, []);
    await mount(<NotificationBellStory />);

    const bell = page.getByRole("button", { name: "Notifications", exact: true });
    await expect(bell).toBeVisible();
    await expect(bell.locator('[data-slot="badge"]')).toHaveCount(0);
  });

  // GEOMETRY, at BOTH pointer sizes — the button's own box is pointer-conditional (`--spacing-control-md`
  // plus `.shell-topbar-icon-btn`'s coarse touch floor), so "the dot is inside the control and out of the
  // glyph's way" is two different measurements, not one. Integer device px at DPR 1 is the rest-state
  // raster requirement (docs/design/integer-line-boxes.md): a fractional box resamples the circle's edge
  // for the element's whole life.
  for (const pointer of [
    { name: "a fine pointer", use: { viewport: { width: 900, height: 600 }, hasTouch: false } },
    { name: "a coarse pointer", use: { viewport: { width: 430, height: 800 }, hasTouch: true } },
  ] as const) {
    test.describe(pointer.name, () => {
      test.use(pointer.use);

      test("the dot sits in the button's top-end corner, inside its box, on the device-pixel grid (#1798)", async ({ mount, page }) => {
        await routeTwoUnread(page);
        await mount(<NotificationBellStory />);

        const bell = page.getByRole("button", { name: "Notifications (2 unread)" });
        const mark = bell.locator('[data-slot="badge"]');
        const glyph = bell.locator("svg");
        await expect(mark).toBeVisible();
        await expect(glyph).toBeVisible();

        // ONE retrying read of ALL three boxes, from the DOT outwards, reduced to the claims in the browser.
        // Three reasons it is shaped this way: the relationships under test are BETWEEN the boxes, so
        // separate round-trips would let a re-layout land between them; `expect.poll` is what makes a
        // geometry read settle rather than sample a mid-layout frame (the DEF-14 class the
        // `ct-no-oneshot-live-read-assert` gate exists for); and a failure prints the whole verdict object,
        // so the receipt names WHICH claim broke and at what pixels.
        await expect
          .poll(async () => mark.evaluate(markVerdict))
          .toMatchObject({
            reachable: true,
            square: true,
            small: true,
            circular: true,
            insideButton: true,
            corner: true,
            dpr: 1,
            onGrid: true,
          });
      });
    });
  }
});
