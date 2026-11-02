// @subject packages/client/src/features/chat/components/member-card-viewer.tsx
// The Members tab's two on-demand reads go through the shared boundary: a held read shows the loading skeleton, a failed one the
// shared error block, and Retry refetches. A card that left the room is the typed gone state, not the error block.

import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import type { TrpcRoutes } from "@orb/testkit/ct";
import {
  holdServed,
  ROOM_PROCEDURES,
  routeAuthConfig,
  routeTrpc,
  SECTION_PROCEDURES,
  SHELL_MOUNT_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROOM_READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  ...ROOM_PROCEDURES,
  "notifications.presence",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

/** A room the owner hosts that holds a character, so both the invite door and View character are offered. */
async function hostedRoomWithCharacter(root: Harness): Promise<{ readonly chatId: ChatId; readonly host: Caller; readonly characterName: string }> {
  // The invite verbs exist only on a multi-human deployment; the caller is built after the setting lands.
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    const chat = await host.chat.getChat({ chatId: room.id });
    const character = chat.participants.find((person) => person.kind === "character");
    if (chat.viewerIsHost && character !== undefined) {
      return { chatId: room.id, host, characterName: character.displayName };
    }
  }
  throw new Error("The corpus has no hosted room with a character");
}

async function openMembers(root: Harness, page: Page, host: Caller, overrides: TrpcRoutes): Promise<void> {
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, { ...serveCorpusProcedures(host, ROOM_READS), ...overrides });
}

test("a held member card read shows the loading skeleton, a failed one the error block, and Retry shows the card", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, characterName } = await hostedRoomWithCharacter(root);
  const hold = holdServed();
  let held = false;
  let failing = true;
  await openMembers(
    root,
    page,
    host,
    serveCorpusProcedures(host, ["chat.getMemberCard"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  );
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await page.getByRole("button", { name: /^Members — /u }).click();
  await page.getByRole("button", { name: new RegExp(`^${characterName} — character`, "u") }).click();
  await page.getByRole("menuitem", { name: "View character", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await hold.requested;
  await expect(dialog.locator('[aria-busy="true"]')).toBeVisible();
  const shell = await dialog.elementHandle();
  hold.fail();
  await expect(dialog.getByText("Couldn't load this character card.", { exact: true })).toBeVisible();
  failing = false;
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByText("Couldn't load this character card.", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: characterName, exact: true })).toBeVisible();
  // The dialog shell is the same node from the held read to the settled card: it never remounts, so its open animation never replays.
  expect(await shell.evaluate((node) => node.isConnected)).toBe(true);
});

test("a card that left the room is the gone state, not the error block", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, characterName } = await hostedRoomWithCharacter(root);
  await openMembers(
    root,
    page,
    host,
    serveCorpusProcedures(host, ["chat.getMemberCard"], () => trpcError({ code: "NOT_FOUND" })),
  );
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await page.getByRole("button", { name: /^Members — /u }).click();
  await page.getByRole("button", { name: new RegExp(`^${characterName} — character`, "u") }).click();
  await page.getByRole("menuitem", { name: "View character", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("This card isn't available", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
});

test("a held outstanding-invites read shows the loading skeleton, a failed one the error block, and Retry shows the list", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostedRoomWithCharacter(root);
  await host.invites.createInvite({ chatId, input: {} });
  const hold = holdServed();
  let held = false;
  let failing = true;
  await openMembers(
    root,
    page,
    host,
    serveCorpusProcedures(host, ["invites.listInvites"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  );
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await page.getByRole("button", { name: /^Members — /u }).click();
  await page.getByRole("button", { name: "Invite people", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await hold.requested;
  await expect(dialog.locator('[aria-busy="true"]')).toBeVisible();
  hold.fail();
  await expect(dialog.getByText("Couldn't load the outstanding invites.", { exact: true })).toBeVisible();
  failing = false;
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByText("Outstanding invites", { exact: true })).toBeVisible();
});
