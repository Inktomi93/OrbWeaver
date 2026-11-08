// The entry editor's Priority and Fire mode controls on a phone: both stay inside the editor's own width.
import { worldEntryIdInputSchema } from "@orb/contracts/world-info";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { WORLD_INFO_ENTRY_TITLE_NAME } from "#client/features/world-info/lib/world-info-names.ts";
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
const PHONE_WIDTHS = [320, 390] as const;
// Rounding of two fractional boxes.
const EDGE_SLACK = 0.5;

test.use({ hasTouch: true, isMobile: true });

for (const width of PHONE_WIDTHS) {
  test(`at ${String(width)} the Priority and Fire mode controls sit inside the editor`, async ({ corpus, mount, page }) => {
    const world = corpus.worldInfoLibrary;
    if (world === undefined) {
      throw new Error("World Info cases require the corpus library");
    }
    await using root = await createCorpusHarness();
    await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
    await page.setViewportSize({ width, height: 844 });
    const component = await mount<typeof WorldInfoMemberStory>(STORY, {
      bookId: world.reads.entry.output.worldBookId,
      entryId: worldEntryIdInputSchema.parse(world.reads.entry.input).entryId,
      context: false,
      phone: true,
    });
    const title = component.getByRole("textbox", { name: WORLD_INFO_ENTRY_TITLE_NAME, exact: true });
    await expect(title).toHaveValue(world.reads.entry.output.title);
    const editor = await title.boundingBox();
    const priority = await component.getByRole("textbox", { name: "Priority", exact: true }).boundingBox();
    const fireMode = await component.getByRole("combobox", { name: "Fire mode", exact: true }).boundingBox();
    if (editor === null || priority === null || fireMode === null) {
      throw new Error("The editor and its two controls must have visible geometry");
    }
    // The rest of the editor holds too: nothing in it runs past its right edge.
    const overflow = await component.evaluate((host, right) => {
      const widest = Math.max(...Array.from(host.querySelectorAll("*"), (element) => element.getBoundingClientRect().right));
      return widest - right;
    }, editor.x + editor.width);
    expect(overflow).toBeLessThanOrEqual(EDGE_SLACK);
    for (const control of [priority, fireMode]) {
      expect(control.x).toBeGreaterThanOrEqual(editor.x - EDGE_SLACK);
      expect(control.x + control.width).toBeLessThanOrEqual(editor.x + editor.width + EDGE_SLACK);
    }
  });
}
