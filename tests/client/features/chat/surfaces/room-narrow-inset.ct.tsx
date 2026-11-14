// @subject packages/client/src/features/chat/surfaces/chat-room-surface.tsx
// @subject packages/ui/src/layout/variants.ts
// @subject packages/ui/src/primitives/room-island/variants.ts
// The room pane steps its side inset down to the narrow `tight` step on a phone, and the composer island steps its own down to the
// field step less the tight one, and both insets hold at enlarged text: neither spends a phone's width on its sides as the text grows,
// and at the default size each is its step.

import { resolvedLength, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { ChatRoomShellStory } from "../components/_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROOM = '[data-slot="chat-room-surface"]';
const COMPOSER = '[data-slot="composer"]';
const PHONES = [
  { name: "320", viewport: { width: 320, height: 700 } },
  { name: "390", viewport: { width: 390, height: 844 } },
] as const;
const ENLARGED_FACTORS = [1.25, 1.5, 2] as const;

/** A box's two inline insets, in pixels. */
function insetsOf(page: Page, selector: string = ROOM): Promise<readonly [number, number]> {
  return page
    .locator(selector)
    .last()
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return [Number.parseFloat(style.paddingInlineStart), Number.parseFloat(style.paddingInlineEnd)] as const;
    });
}

for (const phone of PHONES) {
  test.describe(`${phone.name} room inset`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: phone.viewport });

    test("the narrow inset is the tight step at default text and holds at enlarged text", async ({ corpus, page, mount }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const [room] = (await caller.chat.listChats({ limit: 1 })).items;
      if (room === undefined) {
        throw new Error("Corpus needs a room");
      }
      await seedShellState(page, { activeSection: "chats" });
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });
      await page.locator(ROOM).last().waitFor();
      const tight = await resolvedLength(page, `var(${TOKENS["spacing.tight"].cssVar})`);
      const islandStep = await resolvedLength(page, `calc(var(${TOKENS["spacing.field"].cssVar}) - var(${TOKENS["spacing.tight"].cssVar}))`);
      // The narrow arm is what fires: the pane's wide inset is the block step, which is larger than the tight one.
      expect(await resolvedLength(page, `var(${TOKENS["spacing.block"].cssVar})`)).toBeGreaterThan(tight);
      await expect.poll(() => insetsOf(page)).toEqual([tight, tight]);
      await expect.poll(() => insetsOf(page, COMPOSER)).toEqual([islandStep, islandStep]);
      for (const factor of ENLARGED_FACTORS) {
        await setRootFontScale(page, channelName("fontScale"), factor);
        const at = `at ${String(Math.round(factor * 100))}% text`;
        await expect.poll(() => insetsOf(page), { message: `room inset ${at}` }).toEqual([tight, tight]);
        await expect.poll(() => insetsOf(page, COMPOSER), { message: `composer inset ${at}` }).toEqual([islandStep, islandStep]);
      }
    });
  });
}
