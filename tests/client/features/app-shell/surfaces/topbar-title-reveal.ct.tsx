// @subject packages/client/src/features/chat/components/chat-header-title.tsx
// @subject packages/client/src/features/app-shell/components/shell-topbar.tsx
// A one-line topbar title may cut its text only when the whole title, the cast and the room's name, can be read from the title by the same press,
// tap or key that reaches it, without leaving the surface: the wide title, which is the host's rename control, opens the whole text while it is
// cut, and so does the narrow title, which a phone and the largest desktop text show. The cut title is a control, so on a touch viewport it
// reaches the touch floor at every text size.

import { chatRoomTitle, chatTitleWhole, deriveChatTitle } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatId } from "@orb/kit/ids";
import { hitExtent, resolvedLength, seedShellState, setPlatformTextSize, touchFloorPx } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const DESKTOP = { width: 1440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const CAST = ["Aldebaran Quillfeather of the Northern Lighthouse Keepers' Guild", "Cassiopeia Thornwick-Marsh the Younger of the Salt Marsh Vigil"] as const;
const ROOM_NAME = "The long vigil at the lighthouse keeper's cottage through the whole of the storm season";

// At the default desktop text the shell shows the wide title, at the largest desktop text and on a phone the narrow one. Both open on a press.
const WIDE_WHOLE = chatTitleWhole(deriveChatTitle(null, CAST), ROOM_NAME);
const WIDE = {
  title: (page: Page): Locator => page.locator('.shell-topbar-identity[data-identity="wide"]').getByRole("button", { name: ROOM_NAME }),
  revealed: (page: Page): Locator => page.getByRole("dialog", { name: WIDE_WHOLE, exact: true }),
  whole: (): string => WIDE_WHOLE,
} as const;
const NARROW = {
  title: (page: Page): Locator => page.locator(".shell-topbar").getByRole("button", { name: chatRoomTitle(ROOM_NAME, CAST), exact: true }),
  revealed: (page: Page): Locator => page.getByRole("dialog", { name: chatRoomTitle(ROOM_NAME, CAST), exact: true }),
  whole: (): string => chatRoomTitle(ROOM_NAME, CAST),
} as const;
const REGIMES = [
  { label: "desktop, default text", viewport: DESKTOP, touch: false, text: 1, arm: WIDE },
  { label: "desktop, largest text", viewport: DESKTOP, touch: false, text: 3, arm: NARROW },
  { label: "phone, default text", viewport: PHONE, touch: true, text: 1, arm: NARROW },
  { label: "phone, double text", viewport: PHONE, touch: true, text: 2, arm: NARROW },
  { label: "phone, largest text", viewport: PHONE, touch: true, text: 3, arm: NARROW },
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

/** A room whose cast and name are too long for the topbar's one line at every regime, routed and set to the regime's text size for the length of `stack`. */
async function openCutRoom(
  { corpus, page }: { readonly corpus: CorpusPlayback; readonly page: Page },
  text: number,
  stack: AsyncDisposableStack,
): Promise<ChatId> {
  const root = stack.use(await createCorpusHarness());
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
  stack.use(await setPlatformTextSize(page, text));
  return chat.id;
}

for (const regime of REGIMES) {
  test.describe(regime.label, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.touch });

    test("the whole title, the cast and the room's name, is readable from the cut title", async ({ corpus, mount, page }) => {
      await using stack = new AsyncDisposableStack();
      const chatId = await openCutRoom({ corpus, page }, regime.text, stack);
      await mount<typeof AppShellRoomStory>(STORY, { chatId });

      const title = regime.arm.title(page);
      await expect(title).toBeVisible();
      expect(await titleIsCut(page)).toBe(true);

      await (regime.touch ? title.tap() : title.click());
      await expect(regime.arm.revealed(page)).toContainText(regime.arm.whole());
    });

    if (regime.touch) {
      // The cut title is a control: its hit area is the touch floor on both axes, not the cut line's own height.
      test("the cut title reaches the touch floor", async ({ corpus, mount, page }) => {
        await using stack = new AsyncDisposableStack();
        const chatId = await openCutRoom({ corpus, page }, regime.text, stack);
        await mount<typeof AppShellRoomStory>(STORY, { chatId });

        const title = regime.arm.title(page);
        await expect(title).toBeVisible();
        expect(await titleIsCut(page)).toBe(true);
        // Read a settled bar: the hit area is one measurement of a bar at its token's block size, never the first sample that clears the floor.
        const block = await resolvedLength(page, `var(${TOKENS["dimension.shell-topbar-block"].cssVar})`);
        await expect.poll(async () => (await page.locator(".shell-topbar").boundingBox())?.height).toBeCloseTo(block, 0);
        await page.evaluate(() => document.fonts.ready);
        const floor = await touchFloorPx(page);
        expect(await hitExtent(title, "y")).toBeGreaterThanOrEqual(floor);
        expect(await hitExtent(title, "x")).toBeGreaterThanOrEqual(floor);
      });
    }
  });
}
