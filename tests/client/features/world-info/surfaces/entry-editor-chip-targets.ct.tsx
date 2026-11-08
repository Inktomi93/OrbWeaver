// The entry editor's keyword chips at a fine pointer: the remove mark and the draft input each hold a 24px hit area (WCAG 2.5.8) without the mark or the field growing.
import { worldEntryIdInputSchema } from "@orb/contracts/world-info";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { WorldInfoMemberStory } from "./_member-stories.tsx";

const STORY = "tests/client/features/world-info/surfaces/_member-stories/WorldInfoMemberStory";
const PROCEDURES = [
  "worldInfo.listBooksWithUsage",
  "worldInfo.listAttachmentsForBook",
  "worldInfo.listGlobal",
  "persona.list",
  "worldInfo.getBook",
  "worldInfo.listEntries",
  "settings.getUserSettings",
] as const;
// WCAG 2.5.8 target size (minimum), the floor a fine pointer's hit area must clear.
const FINE_TARGET_PX = 24;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 900 } });

test("a keyword chip's remove mark and the draft input are 24px targets at a fine pointer", async ({ corpus, mount, page }) => {
  const world = corpus.worldInfoLibrary;
  if (world === undefined) {
    throw new Error("World Info cases require the corpus library");
  }
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  const component = await mount<typeof WorldInfoMemberStory>(STORY, {
    bookId: world.reads.entry.output.worldBookId,
    entryId: worldEntryIdInputSchema.parse(world.reads.entry.input).entryId,
    context: false,
  });
  const input = component.getByRole("combobox", { name: "Keyword triggers", exact: true });
  await input.fill("beacon");
  await input.press("Enter");
  const remove = component.locator('[data-slot="combobox-chip-remove"]').last();
  await expect(remove).toBeVisible();

  const mark = await remove.boundingBox();
  const field = await input.boundingBox();
  if (mark === null || field === null) {
    throw new Error("The remove mark and the draft input must have visible geometry");
  }
  // The mark stays its glyph's box; the target is the hit area around it, so nothing visible grew.
  expect(mark.width).toBeLessThan(FINE_TARGET_PX);
  expect(field.height).toBeGreaterThanOrEqual(FINE_TARGET_PX);
  const reach = FINE_TARGET_PX / 2 - 1;
  const centre = { x: mark.x + mark.width / 2, y: mark.y + mark.height / 2 };
  for (const [dx, dy] of [
    [-reach, -reach],
    [reach, -reach],
    [-reach, reach],
    [reach, reach],
  ] as const) {
    expect(await remove.evaluate((node, [x, y]) => node.contains(document.elementFromPoint(x, y)), [centre.x + dx, centre.y + dy] as const)).toBe(true);
  }
});
