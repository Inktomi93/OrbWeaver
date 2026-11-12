// @subject packages/client/src/features/chat/components/chat-header-title.tsx
// @subject packages/client/src/features/app-shell/components/shell-topbar.tsx
// A one-line topbar title may cut its text only when the whole title, the cast and the room's name, can be read from the title without
// leaving the surface: a pointer rests on the wide title and its tooltip prints the whole text; the narrow title, which a phone and the
// largest desktop text show, opens the whole text when pressed.

import { chatRoomTitle, chatTitleWhole, deriveChatTitle, RENAME_CHAT_NAME } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { seedShellState, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const DESKTOP = { width: 1440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const CAST = ["Aldebaran Quillfeather of the Northern Lighthouse Keepers' Guild", "Cassiopeia Thornwick-Marsh the Younger of the Salt Marsh Vigil"] as const;
const ROOM_NAME = "The long vigil at the lighthouse keeper's cottage through the whole of the storm season";

// The wide title is a rename button a pointer rests on; the narrow one is a plain title that a press opens. At the default desktop text the
// shell shows the wide one, at the largest desktop text and on a phone the narrow one.
const WIDE = {
  title: (page: Page): Locator => page.getByRole("button", { name: new RegExp(`^${RENAME_CHAT_NAME}: `, "u") }),
  open: (title: Locator): Promise<void> => title.hover(),
  revealed: (page: Page): Locator => page.locator('[data-slot="tooltip-popup"]'),
  whole: (): string => chatTitleWhole(deriveChatTitle(null, CAST), ROOM_NAME),
} as const;
const NARROW = {
  title: (page: Page): Locator => page.locator(".shell-topbar").getByRole("button", { name: chatRoomTitle(ROOM_NAME, CAST), exact: true }),
  revealed: (page: Page): Locator => page.getByRole("dialog", { name: chatRoomTitle(ROOM_NAME, CAST), exact: true }),
  whole: (): string => chatRoomTitle(ROOM_NAME, CAST),
} as const;
const REGIMES = [
  { label: "desktop, default text", viewport: DESKTOP, touch: false, text: 1, arm: WIDE },
  { label: "desktop, largest text", viewport: DESKTOP, touch: false, text: 3, arm: { ...NARROW, open: (title: Locator): Promise<void> => title.click() } },
  { label: "phone, default text", viewport: PHONE, touch: true, text: 1, arm: { ...NARROW, open: (title: Locator): Promise<void> => title.tap() } },
  { label: "phone, largest text", viewport: PHONE, touch: true, text: 3, arm: { ...NARROW, open: (title: Locator): Promise<void> => title.tap() } },
] as const;

/** Whether a title part is drawn cut by its line: the positive control that the whole text is not already on screen. */
function titleIsCut(page: Page): Promise<boolean> {
  return page
    .locator(".shell-topbar")
    .evaluate((bar) =>
      [...bar.querySelectorAll<HTMLElement>(".shell-topbar-title, .shell-topbar-subtitle, .shell-topbar-title-name")].some(
        (part) => part.checkVisibility() && part.scrollWidth > part.clientWidth,
      ),
    );
}

for (const regime of REGIMES) {
  test.describe(regime.label, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.touch });

    test("the whole title, the cast and the room's name, is readable from the cut title", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const members = await Promise.all(
        CAST.map((name, index) =>
          caller.character.create({ input: createCharacterSchema.parse({ handle: `title-reveal-${String(index)}`, name, description: "A keeper." }) }),
        ),
      );
      const { chat } = await caller.chat.startChat({ characterIds: members.map((member) => member.id), opening: "none" });
      await caller.chat.updateTitle({ chatId: chat.id, title: ROOM_NAME });
      await routeRoom(page, corpus, caller);
      await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
      await using _textSize = await setPlatformTextSize(page, regime.text);
      await mount<typeof AppShellRoomStory>(STORY, { chatId: chat.id });

      const title = regime.arm.title(page);
      await expect(title).toBeVisible();
      expect(await titleIsCut(page)).toBe(true);

      await regime.arm.open(title);
      await expect(regime.arm.revealed(page)).toHaveText(regime.arm.whole());
    });
  });
}
