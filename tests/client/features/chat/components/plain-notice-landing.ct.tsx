// The plain-content notice's control lands in the production shell on the very control it names, at desktop and phone
// widths: the character's Trust tab selected with her HTML rendering control showing, or the install's "Default for
// characters" select showing Plain text. The shell, the transcript and every read are the real ones over a corpus root.
// @subject packages/client/src/components/plain-content-notice.tsx

import { DEFAULT_HTML_STEP_SETTING_LABEL, HTML_TRUST_STEP_LABELS } from "@orb/client/lib";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHARACTER_HTML_TRUST_LABEL, CHARACTER_TRUST_TAB_LABEL } from "#client/features/character/lib/character-names.ts";

import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const NOTICE_ACTION = '[data-slot="plain-notice-action"]';
const SHELL_READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  ...ROOM_PROCEDURES,
  "notifications.presence",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
  "plugin.list",
  "plugin.listSurfaces",
  "regex.listScripts",
  "settings.getUserSettings",
  "admin.listUsers",
  "share.signInMode",
  "share.status",
] as const;
const CARD = ':::card title="Tide tables"\n<p>High water at dusk.</p>\n:::';
const VIEWPORTS = [
  { name: "desktop", use: { hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } } },
  { name: "phone", use: { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } } },
] as const;

/** The first room whose latest character reply the owner hosts, rewritten to hold one card. */
async function cardRoom(root: Root): Promise<{ readonly chatId: ChatId; readonly characterId: CharacterId }> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    if (!(await caller.chat.getChat({ chatId: row.id })).viewerIsHost) {
      continue;
    }
    const { messages } = await caller.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null);
    if (reply?.characterId !== undefined && reply.characterId !== null) {
      await caller.chat.editMessage({ chatId: row.id, messageId: reply.id, content: CARD, timeZone: UTC_TIME_ZONE });
      return { chatId: row.id, characterId: reply.characterId };
    }
  }
  throw new Error("No hosted corpus room has a character reply");
}

async function serveShell(page: Page, root: Root): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(caller, SHELL_READS));
  await seedShellState(page, { activeSection: "chats" });
}

for (const { name, use } of VIEWPORTS) {
  test.describe(`at ${name} width`, () => {
    test.use(use);

    test("a host's notice control opens the character's Trust tab on her HTML rendering control", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const room = await cardRoom(root);
      await caller.character.update({ characterId: room.characterId, input: { trustHtml: false, interactiveHtml: false } });
      await serveShell(page, root);
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.chatId });
      await page.locator(NOTICE_ACTION).click();
      await expect(page.getByRole("tab", { name: CHARACTER_TRUST_TAB_LABEL, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("combobox", { name: CHARACTER_HTML_TRUST_LABEL, exact: true })).toBeVisible();
    });

    test("an admin's notice control opens the install's default for characters, showing Plain text", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const room = await cardRoom(root);
      await caller.character.update({ characterId: room.characterId, input: { trustHtml: null, interactiveHtml: null } });
      await caller.settings.updateAppSettings({ partial: { defaultHtmlStep: "untrusted" } });
      await serveShell(page, root);
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.chatId });
      await page.locator(NOTICE_ACTION).click();
      const control = page.getByRole("combobox", { name: DEFAULT_HTML_STEP_SETTING_LABEL, exact: true });
      await expect(control).toBeInViewport();
      await expect(control).toHaveText(HTML_TRUST_STEP_LABELS.untrusted);
    });
  });
}
