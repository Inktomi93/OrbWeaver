// @subject packages/client/src/features/chat/components/invite-dialog.tsx
// An outstanding targeted invite names the handle it is for, in its row and in its Revoke control; a share link names none.
// A handle nobody holds is refused inline, keyed on the refusal code the server sends. Two invites with the same limits
// are told apart by how long ago each was made.
import type { ChatId } from "@orb/kit/ids";
import { MS_PER_WEEK } from "@orb/kit/time";
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, seedShellState, setPlatformTextSize, toggleStripLayout, watchToastMounts } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nameShape } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_MEMBERS_ENTRY_PREFIX } from "#client/features/chat/lib/chat-surface-names.ts";
import {
  CHAT_INVITE_PEOPLE_NAME,
  INVITE_BY_HANDLE_NAME,
  INVITE_OUTSTANDING_HEADING,
  INVITE_SEND_NAME,
  INVITE_TARGET_UNKNOWN_TEXT,
  inviteRevokeName,
} from "#client/features/chat/lib/members-names.ts";
import { ACCOUNT_HANDLE_FIELD_NAME } from "#client/lib/account-field-names.ts";
import { CREATED_STAMP_LEAD } from "#client/lib/stamp-copy.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  ...ROOM_PROCEDURES,
  "notifications.presence",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
  "invites.listInvites",
] as const;

const UNKNOWN_HANDLE = "nobody-holds-this-handle";

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;

async function hostedRoom(root: Harness): Promise<ChatId> {
  // The invite verbs exist only on a multi-human deployment; the caller is built after the setting lands.
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    if ((await host.chat.getChat({ chatId: room.id })).viewerIsHost) {
      return room.id;
    }
  }
  throw new Error("The corpus has no hosted room");
}

test("the outstanding invite for a person names their handle and its Revoke control does too, while a share link names no one", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await hostedRoom(root);
  const host = await root.internalCallerFor(root.ownerId);
  const guest = await root.principalFor((await root.actor()).id);
  await host.invites.createInvite({ chatId, input: { invitedHandle: guest.handle } });
  await host.invites.createInvite({ chatId, input: {} });
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(host, READS));
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_MEMBERS_ENTRY_PREFIX)}`, "u") }).click();
  await page.getByRole("button", { name: CHAT_INVITE_PEOPLE_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(INVITE_OUTSTANDING_HEADING, { exact: true })).toBeVisible();
  const handle = new RegExp(guest.handle, "u");
  await expect(dialog.getByRole("button", { name: handle })).toHaveCount(1);
  await expect(dialog.getByText(handle)).toHaveCount(1);
  // The control: both invites are listed, so the share link's Revoke is on screen and carries no handle.
  await expect(dialog.getByRole("button", { name: nameShape((kind) => inviteRevokeName(kind, "")) })).toHaveCount(2);
});

test("two share links with the same limits are told apart by when each was made", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await hostedRoom(root);
  const host = await root.internalCallerFor(root.ownerId);
  await host.invites.createInvite({ chatId, input: { maxUses: 2 } });
  // A year apart, so the two ages fall in different units whatever the browser's clock reads.
  root.clock.advance(MS_PER_WEEK * 52);
  await host.invites.createInvite({ chatId, input: { maxUses: 2 } });
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(host, READS));
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_MEMBERS_ENTRY_PREFIX)}`, "u") }).click();
  await page.getByRole("button", { name: CHAT_INVITE_PEOPLE_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: nameShape((kind) => inviteRevokeName(kind, "")) })).toHaveCount(2);
  const ages = dialog.locator('[data-slot="list-row-root"]').getByText(CREATED_STAMP_LEAD);
  await expect(ages).toHaveCount(2);
  const stamps = await ages.allTextContents();
  expect(new Set(stamps).size).toBe(2);
});

test("an invite to a handle nobody holds says so inline, from the server's own refusal code, and keeps the typed handle", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await hostedRoom(root);
  const host = await root.internalCallerFor(root.ownerId);
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(host, [...READS, "invites.createInvite"]));
  const toastMounts = await watchToastMounts(page);
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_MEMBERS_ENTRY_PREFIX)}`, "u") }).click();
  await page.getByRole("button", { name: CHAT_INVITE_PEOPLE_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: INVITE_BY_HANDLE_NAME, exact: true }).click();
  const handle = dialog.getByRole("textbox", { name: ACCOUNT_HANDLE_FIELD_NAME });
  await handle.fill(UNKNOWN_HANDLE);
  await dialog.getByRole("button", { name: INVITE_SEND_NAME, exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(INVITE_TARGET_UNKNOWN_TEXT);
  await expect(handle).toHaveValue(UNKNOWN_HANDLE);
  expect(await toastMounts()).toBe(0);
});

test.describe("on a phone at the browser's enlarged text", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  for (const scale of PLATFORM_TEXT_SCALES) {
    test(`at ${String(scale * 100)}% text the invite mode strip keeps its labels whole and inside the strip`, async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const chatId = await hostedRoom(root);
      const host = await root.internalCallerFor(root.ownerId);
      await seedShellState(page, { activeSection: "chats" });
      await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
      await routeTrpc(page, serveCorpusProcedures(host, READS));
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_MEMBERS_ENTRY_PREFIX)}`, "u") }).click();
      await page.getByRole("button", { name: CHAT_INVITE_PEOPLE_NAME, exact: true }).click();
      const dialog = page.getByRole("dialog");
      // The room opens at the default size, where its topbar still carries the Members door; the text then grows under the open dialog.
      await using _textSize = await setPlatformTextSize(page, scale);
      const modes = dialog.locator('[data-slot="toggle-group"]').filter({ has: page.getByRole("button", { name: INVITE_BY_HANDLE_NAME, exact: true }) });
      await expect(modes).toBeVisible();
      const layout = await toggleStripLayout(modes);
      // Two modes: a share link and an invite by handle.
      expect(layout.cutWords).toEqual([0, 0]);
      expect(layout.pastStrip).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    });
  }
});
