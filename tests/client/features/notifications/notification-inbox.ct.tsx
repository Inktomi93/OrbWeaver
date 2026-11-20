import { blobUrl } from "@orb/contracts/assets";
import { NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import { brandedId } from "@orb/kit/ids";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusViewerReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  acceptInvitationName,
  DEFERRED_TURN_HOST_UNAVAILABLE_COPY,
  DISMISS_NAME_LEAD,
  declineInvitationName,
  LOAD_MORE_DISMISSED_LABEL,
  LOAD_MORE_LABEL,
  NOTIFICATIONS_BELL_NAME,
  NOTIFICATIONS_UNREAD_FLOOR_MARK,
  notificationsBellLabel,
  SHOW_DISMISSED_LABEL,
} from "#client/features/notifications/lib/notifications-copy.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { NotificationInboxStory } from "./_ct-stories.tsx";

const STORY = "tests/client/features/notifications/_ct-stories/NotificationInboxStory";
const INBOX_PROCEDURES = ["notifications.list", "notifications.markAllRead", "notifications.dismiss", "plugin.list"] as const;
// The bell's name leads with its base name and may carry a count after it; the dismiss press leads with its verb and names the row after it.
const BELL = new RegExp(`^${RegExp.escape(NOTIFICATIONS_BELL_NAME)}`, "u");
const DISMISS_NAME_PATTERN = new RegExp(`^${RegExp.escape(DISMISS_NAME_LEAD)} `, "u");
// The server's default page, which the client's list asks for by omission.
const PAGE_SIZE = 50;
const POPUP = '[data-slot="popover-popup"]';
const ROW = '[data-slot="inbox-row"]';
const DISMISSED_ROW = '[data-slot="inbox-dismissed-row"]';
// The longest notice the payload admits, with nowhere to break: a URL in an automation message.
const UNBROKEN_NOTICE = "x".repeat(200);

type CorpusRoot = Awaited<ReturnType<typeof createCorpusHarness>>;
type ReaderCaller = Awaited<ReturnType<CorpusRoot["internalCallerFor"]>>;

/** A reader whose active inbox runs past the first page, as unread rows, so opening the bell refetches. */
async function seededInbox(root: CorpusRoot, readerUserId: string): Promise<{ readonly rpc: ReaderCaller; readonly firstPage: number }> {
  const rpc = await root.internalCallerFor(brandedId("UserId").parse(readerUserId));
  const seed = (await rpc.notifications.list({})).items[0];
  if (seed === undefined) {
    throw new Error("The shared corpus omitted the reader's inbox rows");
  }
  for (let index = 0; index < NOTIFICATIONS_LIST_MAX_LIMIT; index += 1) {
    await root.services.notifications.record({ event: seed.payload });
  }
  return { rpc, firstPage: (await rpc.notifications.list({})).items.length };
}

/** Top the reader's active inbox up to exactly `total` rows, so a test owns where the pages end. */
async function inboxOfExactly(root: CorpusRoot, readerUserId: string, total: number): Promise<ReaderCaller> {
  const rpc = await root.internalCallerFor(brandedId("UserId").parse(readerUserId));
  const { items } = await rpc.notifications.list({});
  const seed = items[0];
  if (seed === undefined) {
    throw new Error("The shared corpus omitted the reader's inbox rows");
  }
  for (let count = items.length; count < total; count += 1) {
    await root.services.notifications.record({ event: seed.payload });
  }
  return rpc;
}

async function openBell(page: Page): Promise<void> {
  await page.getByRole("button", { name: BELL }).click();
}

test.use({
  corpusViewer: async ({ corpus }, provide) => {
    const viewer = corpus.memberIdentities?.notificationReader.viewer;
    if (viewer === undefined) {
      throw new Error("The shared corpus omitted its native notification reader");
    }
    await provide(viewer);
  },
});

test("the registered bell settles a held native inbox read into its unread state", async ({ corpus, mount, page }) => {
  const snapshots = corpus.notificationInbox;
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (snapshots === undefined || reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader cohort");
  }
  const ownerAvatar = corpus.reads["character.list"][0]?.output.items.find((row) => row.avatarHash !== null)?.avatarHash;
  if (ownerAvatar === undefined || ownerAvatar === null) {
    throw new Error("The shared corpus omitted its owner-only media control");
  }
  await using root = await createCorpusHarness();
  const rpc = await root.internalCallerFor(brandedId("UserId").parse(reader.userId));
  await rpc.notifications.markAllRead();
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  const owner = await root.internalCallerFor(root.ownerId);
  for (const title of ["Unread invitation one", "Unread invitation two"]) {
    const room = (await owner.chat.startChat({ characterIds: [], title, opening: "none" })).chat;
    await owner.invites.createInvite({ chatId: room.id, input: { invitedHandle: reader.handle } });
  }
  const hold = holdServed();
  const trpc = await routeTrpc(
    page,
    serveCorpusProcedures(rpc, ["notifications.list"], () => hold),
  );
  await mount<typeof NotificationInboxStory>("tests/client/features/notifications/_ct-stories/NotificationInboxStory", {});
  await hold.requested;
  await expect(page.getByRole("button", { name: NOTIFICATIONS_BELL_NAME, exact: true })).toBeVisible();
  hold.release();
  // The unread state is the behavior under test: the settled bell carries the two unread invitations and is no longer the idle bell.
  const settled = page.getByRole("button", { name: BELL });
  await expect(settled).toHaveAccessibleName(/\b2\b/u);
  await expect(settled).not.toHaveAccessibleName(NOTIFICATIONS_BELL_NAME);
  const foreign = await page.evaluate(async (path) => {
    const response = await fetch(path);
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
  }, blobUrl(ownerAvatar));
  expect(foreign).toEqual({ status: 404, bytes: 0 });
  const inputs = trpc.inputs("notifications.list");
  expect(inputs.length).toBeGreaterThan(0);
  for (const input of inputs) {
    expect(input).toEqual({ direction: "forward" });
  }
});

test("the captured read stage keeps pending invitation actions without marking the inbox again", async ({ corpus, mount, page }) => {
  const snapshots = corpus.notificationInbox;
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (snapshots === undefined || reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader cohort");
  }
  const snapshot = snapshots.readerRead;
  const respond = createCorpusViewerReadResponder("notifications.list", reader.userId, snapshot);
  expect(() => respond(undefined)).toThrow("Uncaptured corpus read");
  expect(() => createCorpusViewerReadResponder("notifications.list", snapshots.foreignBefore.viewerUserId, snapshot)).toThrow("snapshot viewer does not match");
  const trpc = await routeTrpc(page, { "notifications.list": respond });
  await mount<typeof NotificationInboxStory>("tests/client/features/notifications/_ct-stories/NotificationInboxStory", {});
  const bell = page.getByRole("button", { name: NOTIFICATIONS_BELL_NAME, exact: true });
  await expect(bell.locator('[data-slot="badge"]')).toBeVisible();
  // StrictMode replays the initial owner; opening the already-read inbox must not add another read.
  const initialInputs = structuredClone(trpc.inputs("notifications.list"));
  expect(initialInputs.length).toBeGreaterThan(0);
  for (const input of initialInputs) {
    expect(input).toEqual({ direction: "forward" });
  }
  await bell.click();
  const invitations = snapshot.read.output.items.flatMap((item) => (item.payload.type === "invite" ? [item.payload] : []));
  expect(invitations).toHaveLength(2);
  for (const [index, invitation] of invitations.entries()) {
    const accept = page.getByRole("button", { name: acceptInvitationName(invitation.invitedByHandle), exact: true });
    const decline = page.getByRole("button", { name: declineInvitationName(invitation.invitedByHandle), exact: true });
    await expect(accept).toHaveCount(invitations.length);
    await expect(decline).toHaveCount(invitations.length);
    await expect(accept.nth(index)).toBeVisible();
    await expect(decline.nth(index)).toBeVisible();
  }
  expect(trpc.inputs("notifications.list")).toEqual(initialInputs);
  expect(trpc.count("notifications.markAllRead")).toBe(0);
});

test("older rows load on request and a row dismissed on another device stays out of the inbox and shows under dismissed", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const readerId = brandedId("UserId").parse(reader.userId);
  const rpc = await root.internalCallerFor(readerId);
  const seed = (await rpc.notifications.list({})).items[0];
  if (seed === undefined) {
    throw new Error("The shared corpus omitted the reader's inbox rows");
  }
  for (let index = 0; index < NOTIFICATIONS_LIST_MAX_LIMIT; index += 1) {
    await root.services.notifications.record({ event: seed.payload });
  }
  await rpc.notifications.markAllRead();
  const dismissed = (await rpc.notifications.list({})).items[0];
  if (dismissed === undefined) {
    throw new Error("The reader's seeded inbox is empty");
  }
  await rpc.notifications.dismiss({ notificationId: dismissed.id });
  const firstPage = await rpc.notifications.list({});
  const remaining = await rpc.notifications.list({ limit: NOTIFICATIONS_LIST_MAX_LIMIT });
  await routeTrpc(page, serveCorpusProcedures(rpc, ["notifications.list", "notifications.markAllRead"]));
  await mount<typeof NotificationInboxStory>("tests/client/features/notifications/_ct-stories/NotificationInboxStory", {});
  await page.getByRole("button", { name: NOTIFICATIONS_BELL_NAME, exact: true }).click();
  const rows = page.locator('[data-slot="inbox-row"]');
  await expect(rows).toHaveCount(firstPage.items.length);
  await page.getByRole("button", { name: LOAD_MORE_LABEL, exact: true }).click();
  await expect(rows).toHaveCount(remaining.items.length);
  const older = page.locator('[data-slot="inbox-dismissed-row"]');
  await expect(older).toHaveCount(0);
  await page.getByRole("button", { name: SHOW_DISMISSED_LABEL, exact: true }).click();
  const archive = await rpc.notifications.list({ state: "dismissed" });
  expect(archive.items.map((item) => item.id)).toContain(dismissed.id);
  await expect(older).toHaveCount(archive.items.length);
  await expect(older.getByRole("button")).toHaveCount(0);
});

test("a failed inbox read offers a retry and never claims the inbox is empty", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const rpc = await root.internalCallerFor(brandedId("UserId").parse(reader.userId));
  let failing = true;
  await routeTrpc(
    page,
    serveCorpusProcedures(rpc, INBOX_PROCEDURES, () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined)),
  );
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  const popup = page.locator(POPUP);
  const retry = popup.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
  await expect(retry).toBeVisible();
  await expect(popup.locator('[data-slot="empty-state"]')).toHaveCount(0);
  failing = false;
  await retry.click();
  await expect(popup.locator(ROW).first()).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test("a Load more press lands while a background refetch is running", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const { rpc, firstPage } = await seededInbox(root, reader.userId);
  const hold = holdServed();
  let armed = false;
  await routeTrpc(
    page,
    serveCorpusProcedures(rpc, INBOX_PROCEDURES, (input) => (armed && input !== undefined && !("cursor" in input) ? hold : undefined)),
  );
  await mount<typeof NotificationInboxStory>(STORY, {});
  await expect(page.getByRole("button", { name: notificationsBellLabel(firstPage, true), exact: true })).toBeVisible();
  armed = true;
  await openBell(page);
  await hold.requested;
  armed = false;
  const rows = page.locator(ROW);
  await expect(rows).toHaveCount(firstPage);
  await page.getByRole("button", { name: LOAD_MORE_LABEL, exact: true }).click();
  await expect.poll(() => rows.count()).toBeGreaterThan(firstPage);
  hold.release();
});

test("a background refetch neither raises nor clears a Load more failure", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const { rpc, firstPage } = await seededInbox(root, reader.userId);
  let failRefetch = false;
  let failPage = false;
  const trpc = await routeTrpc(
    page,
    serveCorpusProcedures(rpc, INBOX_PROCEDURES, (input) => {
      const paged = input !== undefined && "cursor" in input;
      return (paged && failPage) || (!paged && failRefetch) ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined;
    }),
  );
  await mount<typeof NotificationInboxStory>(STORY, {});
  await expect(page.getByRole("button", { name: notificationsBellLabel(firstPage, true), exact: true })).toBeVisible();
  const reads = trpc.count("notifications.list");
  failRefetch = true;
  await openBell(page);
  await expect.poll(() => trpc.count("notifications.list")).toBeGreaterThan(reads);
  const popup = page.locator(POPUP);
  const loadMore = popup.getByRole("button", { name: LOAD_MORE_LABEL, exact: true });
  await expect(loadMore).toBeVisible();
  const failure = popup.getByRole("alert");
  await expect(failure).toHaveCount(0);
  failRefetch = false;
  failPage = true;
  await loadMore.click();
  await expect(failure).toHaveCount(1);
  const beforeDismiss = trpc.count("notifications.list");
  await popup.locator(ROW).first().getByRole("button", { name: DISMISS_NAME_PATTERN }).click();
  await expect.poll(() => trpc.count("notifications.list")).toBeGreaterThan(beforeDismiss);
  await expect(failure).toHaveCount(1);
});

test("the keyboard stays with the list when a page loads, and the last page does not send it back to the top", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const { rpc, firstPage } = await seededInbox(root, reader.userId);
  await routeTrpc(page, serveCorpusProcedures(rpc, INBOX_PROCEDURES));
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  const rows = page.locator(ROW);
  await expect(rows).toHaveCount(firstPage);
  const loadMore = page.getByRole("button", { name: LOAD_MORE_LABEL, exact: true });
  await loadMore.focus();
  await page.keyboard.press("Enter");
  await expect(rows.nth(firstPage)).toBeFocused();
  await expect(rows.nth(firstPage)).toBeInViewport();
  await loadMore.focus();
  await page.keyboard.press("Enter");
  await expect(rows.nth(firstPage * 2)).toBeFocused();
  await expect(loadMore).toHaveCount(0);
});

test("Show dismissed lands the reader on what it revealed", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const { rpc, firstPage } = await seededInbox(root, reader.userId);
  const dismissed = (await rpc.notifications.list({})).items[0];
  if (dismissed === undefined) {
    throw new Error("The reader's seeded inbox is empty");
  }
  await rpc.notifications.dismiss({ notificationId: dismissed.id });
  await routeTrpc(page, serveCorpusProcedures(rpc, INBOX_PROCEDURES));
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  await expect(page.locator(ROW)).toHaveCount(firstPage);
  await page.getByRole("button", { name: SHOW_DISMISSED_LABEL, exact: true }).focus();
  await page.keyboard.press("Enter");
  const first = page.locator(DISMISSED_ROW).first();
  await expect(first).toBeFocused();
  await expect(first).toBeInViewport();
});

test("opening the bell cannot put a decision one Enter away", async ({ corpus, mount, page }) => {
  const snapshots = corpus.notificationInbox;
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (snapshots === undefined || reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader cohort");
  }
  await routeTrpc(page, { "notifications.list": createCorpusViewerReadResponder("notifications.list", reader.userId, snapshots.readerRead) });
  await mount<typeof NotificationInboxStory>(STORY, {});
  await page.getByRole("button", { name: NOTIFICATIONS_BELL_NAME, exact: true }).click();
  await expect(page.locator(POPUP)).toBeFocused();
});

test("past the first page the bell says its unread count is a floor, and dismissed paging names itself", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const { rpc } = await seededInbox(root, reader.userId);
  for (const { id } of (await rpc.notifications.list({ limit: NOTIFICATIONS_LIST_MAX_LIMIT })).items) {
    await rpc.notifications.dismiss({ notificationId: id });
  }
  const { firstPage: unread } = await seededInbox(root, reader.userId);
  await routeTrpc(page, serveCorpusProcedures(rpc, INBOX_PROCEDURES));
  await mount<typeof NotificationInboxStory>(STORY, {});
  // The floor mark is the behavior under test, so the bell is found by the mark itself and the uncapped name is asserted absent.
  await expect(page.getByRole("button", { name: `${String(unread)}${NOTIFICATIONS_UNREAD_FLOOR_MARK}` })).toBeVisible();
  await expect(page.getByRole("button", { name: notificationsBellLabel(unread, false), exact: true })).toHaveCount(0);
  await openBell(page);
  await page.getByRole("button", { name: SHOW_DISMISSED_LABEL, exact: true }).click();
  await expect(page.getByRole("button", { name: LOAD_MORE_DISMISSED_LABEL, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: LOAD_MORE_LABEL, exact: true })).toHaveCount(1);
});

test("an unbroken notice wraps inside its row", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const readerId = brandedId("UserId").parse(reader.userId);
  const rpc = await root.internalCallerFor(readerId);
  await root.services.notifications.record({
    event: {
      type: "automation-notice",
      recipientUserId: readerId,
      chatId: null,
      source: { kind: "rule", ruleId: root.ids.typeId("automation_rule") },
      message: UNBROKEN_NOTICE,
    },
  });
  await routeTrpc(page, serveCorpusProcedures(rpc, INBOX_PROCEDURES));
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  const row = page.locator(ROW).filter({ hasText: UNBROKEN_NOTICE });
  await expect(row).toBeVisible();
  const overflow = await row.evaluate((element) => {
    const copy = element.querySelector("span");
    const inline = element.getBoundingClientRect().right;
    return copy === null ? Number.POSITIVE_INFINITY : copy.getBoundingClientRect().right - inline;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

test("an inbox that ends on a page boundary offers no Load more", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const rpc = await inboxOfExactly(root, reader.userId, PAGE_SIZE);
  await routeTrpc(page, serveCorpusProcedures(rpc, INBOX_PROCEDURES));
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  await expect(page.locator(ROW)).toHaveCount(PAGE_SIZE);
  await expect(page.getByRole("button", { name: LOAD_MORE_LABEL, exact: true })).toHaveCount(0);
});

test("a press that brings no row leaves nothing armed, so a later refetch cannot move focus", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const rpc = await inboxOfExactly(root, reader.userId, PAGE_SIZE + 1);
  const newest = (await rpc.notifications.list({})).items[0];
  const oldest = (await rpc.notifications.list({ limit: PAGE_SIZE + 1 })).items.at(PAGE_SIZE);
  if (newest === undefined || oldest === undefined) {
    throw new Error("The reader's seeded inbox is short");
  }
  const trpc = await routeTrpc(page, serveCorpusProcedures(rpc, INBOX_PROCEDURES));
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  const rows = page.locator(ROW);
  await expect(rows).toHaveCount(PAGE_SIZE);
  // The row the cursor promised leaves on another device, so the pressed page lands empty.
  await rpc.notifications.dismiss({ notificationId: oldest.id });
  const loadMore = page.getByRole("button", { name: LOAD_MORE_LABEL, exact: true });
  await loadMore.click();
  await expect(loadMore).toHaveCount(0);
  await root.services.notifications.record({ event: newest.payload });
  await root.services.notifications.record({ event: newest.payload });
  const reads = trpc.count("notifications.list");
  await rows.first().getByRole("button", { name: DISMISS_NAME_PATTERN }).click();
  await expect.poll(() => trpc.count("notifications.list")).toBeGreaterThan(reads);
  await expect(rows).toHaveCount(PAGE_SIZE + 1);
  await expect(rows.nth(PAGE_SIZE)).not.toBeFocused();
});

test("a list invalidate during a pressed page still ends in that page", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const { rpc, firstPage } = await seededInbox(root, reader.userId);
  const hold = holdServed();
  let armed = true;
  await routeTrpc(
    page,
    serveCorpusProcedures(rpc, INBOX_PROCEDURES, (input) => {
      const held = armed && input !== undefined && "cursor" in input;
      armed &&= !held;
      return held ? hold : undefined;
    }),
  );
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  const rows = page.locator(ROW);
  await expect(rows).toHaveCount(firstPage);
  await page.getByRole("button", { name: LOAD_MORE_LABEL, exact: true }).click();
  await hold.requested;
  await rows.first().getByRole("button", { name: DISMISS_NAME_PATTERN }).click();
  await expect.poll(() => rows.count()).toBeGreaterThan(firstPage);
  hold.release();
});

test("the dismissed list takes the same press: an invalidate cannot drop its page", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const { rpc } = await seededInbox(root, reader.userId);
  const { items } = await rpc.notifications.list({ limit: NOTIFICATIONS_LIST_MAX_LIMIT });
  for (const { id } of items.slice(1)) {
    await rpc.notifications.dismiss({ notificationId: id });
  }
  const hold = holdServed();
  let armed = true;
  await routeTrpc(
    page,
    serveCorpusProcedures(rpc, INBOX_PROCEDURES, (input) => {
      const held = armed && input !== undefined && "cursor" in input && input.state === "dismissed";
      armed &&= !held;
      return held ? hold : undefined;
    }),
  );
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  await page.getByRole("button", { name: SHOW_DISMISSED_LABEL, exact: true }).click();
  const older = page.locator(DISMISSED_ROW);
  await expect(older).toHaveCount(PAGE_SIZE);
  await page.getByRole("button", { name: LOAD_MORE_DISMISSED_LABEL, exact: true }).click();
  await hold.requested;
  await page.locator(ROW).first().getByRole("button", { name: DISMISS_NAME_PATTERN }).click();
  await expect.poll(() => older.count()).toBeGreaterThan(PAGE_SIZE);
  hold.release();
});

test("Show dismissed sits above the rows, in reach with every page loaded", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const { rpc } = await seededInbox(root, reader.userId);
  await routeTrpc(page, serveCorpusProcedures(rpc, INBOX_PROCEDURES));
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  await page.getByRole("button", { name: LOAD_MORE_LABEL, exact: true }).click();
  const toggle = page.getByRole("button", { name: SHOW_DISMISSED_LABEL, exact: true });
  const first = page.locator(ROW).first();
  await expect(first).toBeVisible();
  const [toggleBox, firstBox] = [await toggle.boundingBox(), await first.boundingBox()];
  expect(toggleBox?.y).toBeLessThan(firstBox?.y ?? Number.NEGATIVE_INFINITY);
});

test("a queued reply dropped for consent says the host is unavailable", async ({ corpus, mount, page }) => {
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader");
  }
  await using root = await createCorpusHarness();
  const readerId = brandedId("UserId").parse(reader.userId);
  const rpc = await root.internalCallerFor(readerId);
  await root.services.notifications.record({
    event: { type: "deferred-turn-dropped", recipientUserId: readerId, chatId: root.ids.typeId("chat"), reason: "consent" },
  });
  await routeTrpc(page, serveCorpusProcedures(rpc, INBOX_PROCEDURES));
  await mount<typeof NotificationInboxStory>(STORY, {});
  await openBell(page);
  await expect(page.locator(ROW).filter({ hasText: DEFERRED_TURN_HOST_UNAVAILABLE_COPY })).toHaveCount(1);
});
