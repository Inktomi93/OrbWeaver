import { blobUrl } from "@orb/contracts/assets";
import { NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import { brandedId } from "@orb/kit/ids";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusViewerReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { NotificationInboxStory } from "./_ct-stories.tsx";

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
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  hold.release();
  await expect(page.getByRole("button", { name: "Notifications (2 unread)", exact: true })).toBeVisible();
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
  const bell = page.getByRole("button", { name: "Notifications", exact: true });
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
    const accept = page.getByRole("button", { name: `Accept invitation from ${invitation.invitedByHandle}`, exact: true });
    const decline = page.getByRole("button", { name: `Decline invitation from ${invitation.invitedByHandle}`, exact: true });
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
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  const rows = page.locator('[data-slot="inbox-row"]');
  await expect(rows).toHaveCount(firstPage.items.length);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(rows).toHaveCount(remaining.items.length);
  const older = page.locator('[data-slot="inbox-dismissed-row"]');
  await expect(older).toHaveCount(0);
  await page.getByRole("button", { name: "Show dismissed", exact: true }).click();
  const archive = await rpc.notifications.list({ state: "dismissed" });
  expect(archive.items.map((item) => item.id)).toContain(dismissed.id);
  await expect(older).toHaveCount(archive.items.length);
  await expect(older.getByRole("button")).toHaveCount(0);
});
