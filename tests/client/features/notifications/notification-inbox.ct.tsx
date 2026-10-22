import { blobUrl } from "@orb/contracts/assets";
import { createCorpusViewerReadResponder } from "@orb/testkit/iso/corpus-read-responder.ts";
import { expect, test } from "@orb/testkit/node/ct-corpus.ts";
import { routeTrpc, trpcHold } from "@orb/testkit/node/route-trpc.ts";
import { NotificationInboxStory } from "./_ct-stories.tsx";

test.use({
  corpusViewer: async ({ corpus }, provide) => {
    const viewer = corpus.memberIdentities?.notificationReader.viewer;
    if (viewer === undefined) {
      throw new Error("The shared corpus omitted its native notification reader");
    }
    await provide(viewer);
  },
});

test("the registered bell settles a held native inbox read into the captured unread state", async ({ corpus, mount, page }) => {
  const snapshots = corpus.notificationInbox;
  const reader = corpus.memberIdentities?.notificationReader.viewer;
  if (snapshots === undefined || reader === undefined) {
    throw new Error("The shared corpus omitted its native notification reader cohort");
  }
  const ownerAvatar = corpus.reads["character.list"][0]?.output.items.find((row) => row.avatarHash !== null)?.avatarHash;
  if (ownerAvatar === undefined || ownerAvatar === null) {
    throw new Error("The shared corpus omitted its owner-only media control");
  }
  const respond = createCorpusViewerReadResponder("notifications.list", reader.userId, snapshots.readerRaised);
  const hold = trpcHold<"notifications.list">();
  const trpc = await routeTrpc(page, {
    "notifications.list": (input) => {
      respond(input);
      return hold;
    },
  });
  await mount(<NotificationInboxStory />);
  await hold.requested;
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  hold.release(respond({}));
  await expect(page.getByRole("button", { name: "Notifications (2 unread)", exact: true })).toBeVisible();
  const foreign = await page.evaluate(async (path) => {
    const response = await fetch(path);
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
  }, blobUrl(ownerAvatar));
  expect(foreign).toEqual({ status: 404, bytes: 0 });
  expect(trpc.inputs("notifications.list")).toEqual([{}]);
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
  await mount(<NotificationInboxStory />);
  const bell = page.getByRole("button", { name: "Notifications", exact: true });
  await expect(bell.locator('[data-slot="badge"]')).toBeVisible();
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
  expect(trpc.inputs("notifications.list")).toEqual([{}]);
  expect(trpc.count("notifications.markAllRead")).toBe(0);
});
