// @subject packages/client/src/features/world-info/surfaces/world-info-member-surface.tsx
// A World Info entry's heading, wrapped under its Back link on a narrow host at the enlarged text step, starts on the edge the
// editor's fields below it start on.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { createEntrySchema } from "@orb/contracts/world-info";
import { LAYOUT_SUBPIXEL_PX } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { CollectionCompositionStory } from "./_collection-composition-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_collection-composition-stories/CollectionCompositionStory";
const BOOK = "Entry alignment book";
const ENTRY = "Mage";
const WIDTH = 300;

test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

test("a wrapped entry heading starts on the edge the editor's first field starts on at the enlarged text step", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const appearance = appearanceSettingsSchema.parse({ fontScale: ENLARGED_APPEARANCE_SETTINGS.fontScale });
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
  const book = await caller.worldInfo.createBook({ input: { name: BOOK } });
  await caller.worldInfo.createEntry({ bookId: book.id, input: createEntrySchema.parse({ title: ENTRY, content: "A mage." }) });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "worldInfo.listBooksWithUsage", "worldInfo.getBook", "worldInfo.listEntries", "worldInfo.getEntry"]),
  );
  await mount<typeof CollectionCompositionStory>(STORY, { group: "worldInfo", width: WIDTH, height: 900, appearance });
  const content = page.locator('[data-slot="config-content"]');
  await content
    .getByRole("button", { name: new RegExp(`^Open ${BOOK}`, "u") })
    .first()
    .click();
  await content.getByRole("button", { name: ENTRY, exact: true }).first().click();

  const heading = content.getByRole("heading", { name: ENTRY, exact: true });
  const firstField = content.getByRole("textbox").first();
  await expect(heading).toBeVisible();
  // The heading's first glyph, not its box: a box edge says nothing about where the text starts.
  const glyphX = await heading.evaluate((node) => {
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
    if (text === null) {
      throw new Error("the heading has no text");
    }
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    return range.getBoundingClientRect().left;
  });
  const fieldBox = await firstField.boundingBox();
  await test.info().attach("entry-edges", { body: JSON.stringify({ glyphX, fieldX: fieldBox?.x }), contentType: "application/json" });
  expect(Math.abs(glyphX - (fieldBox?.x ?? Number.NaN))).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
});
