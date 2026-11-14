// @subject packages/client/src/features/chat/components/ghost-message-row.tsx
// The live reply is laid out as the row it settles into: its header bar ends, and its text starts, as far down as the
// settled last row's. Document is the one style whose header carries actions only, so it is the one whose live row has no name
// to hold the line open; a touch pointer and a fine pointer both show the settled row's actions bar.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { StreamingReplyStory } from "./_ghost-macro-stories.tsx";
import { GHOST_ROOM_PROCEDURES, soloRoom } from "./ghost-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_ghost-macro-stories/StreamingReplyStory";
const STREAM_LABEL = "Stream a reply";
const STREAMED = "The lantern swung once and settled.";
const NAME_ROW = '[data-slot="message-name-row"]';
const BUBBLE = '[data-slot="message-bubble"]';
const PHONE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1280, height: 900 } as const;
const DOCUMENT = "document" as const satisfies ThemeChatStyle;

interface RowGeometry {
  readonly barBottom: number;
  readonly textOffset: number;
}

/** How far below the bubble's top the header bar ends and the first line of text starts. */
async function geometryOf(row: Locator): Promise<RowGeometry> {
  return await row.evaluate(
    (node, selectors) => {
      const header = node.querySelector(selectors.nameRow);
      const bubble = node.querySelector(selectors.bubble);
      const text = bubble?.querySelector("p");
      if (header === null || bubble === null || text === null || text === undefined) {
        throw new Error("The row has no header, bubble or first paragraph to measure");
      }
      const top = bubble.getBoundingClientRect().top;
      return { barBottom: header.getBoundingClientRect().bottom - top, textOffset: text.getBoundingClientRect().top - top };
    },
    { nameRow: NAME_ROW, bubble: BUBBLE },
  );
}

const POINTERS = [
  { name: "touch", viewport: PHONE, hasTouch: true, isMobile: true },
  { name: "fine", viewport: DESKTOP, hasTouch: false, isMobile: false },
] as const;

for (const pointer of POINTERS) {
  test.describe(`${pointer.name} pointer`, () => {
    test.use({ viewport: pointer.viewport, hasTouch: pointer.hasTouch, isMobile: pointer.isMobile });

    test(`a streaming ${DOCUMENT} reply keeps the header line and text start of the settled last row`, async ({ mount, page, corpusMedia }) => {
      await using root = await createCorpusHarness();
      const { chatId, characterId } = await soloRoom(root);
      const owner = await root.internalCallerFor(root.ownerId);
      await owner.settings.updateUserSettingsSection({
        section: "appearance",
        patch: appearanceSettingsSchema.parse({ chatStyle: DOCUMENT, blurSurfaces: [], backgroundImageKind: "none" }),
      });
      await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
      await routeTrpc(page, serveCorpusProcedures(owner, GHOST_ROOM_PROCEDURES));
      await corpusMedia();
      await mount<typeof StreamingReplyStory>(STORY, {
        chatId,
        speakerCharacterId: characterId,
        streamedText: STREAMED,
        streamLabel: STREAM_LABEL,
        hostWidth: pointer.viewport.width,
      });

      const lastRow = page.locator('[data-slot="message-row"]').last();
      await expect(lastRow.locator("p").first()).toBeVisible();
      const settled = await geometryOf(lastRow);

      await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
      const ghost = page.locator('[data-slot="ghost-message-row"]');
      await expect(ghost.locator('[data-slot="ghost-stream-body"]')).toContainText(STREAMED);
      const live = await geometryOf(ghost);

      expect(live.barBottom).toBeCloseTo(settled.barBottom, 0);
      expect(live.textOffset).toBeCloseTo(settled.textOffset, 0);
    });
  });
}
