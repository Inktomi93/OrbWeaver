// The Presets list band's Import door inside the production shell: an icon beside New, found by its accessible name, drawn as the
// file-import glyph, and never folded into the More menu at any width the shell gives the list, nor at 200% text. The shell's own
// stylesheet and the band's room decide the fold, so the cases mount the shell.
// @subject packages/client/src/features/preset/hooks/use-preset-list-header.tsx
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { PRESET_IMPORT_TITLE } from "#client/features/preset/lib/preset-names.ts";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import type { FileInputGlyphStory } from "./_list-band-import-door-stories.tsx";
import { PHONE, routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const GLYPH_STORY = "tests/client/features/app-shell/surfaces/_list-band-import-door-stories/FileInputGlyphStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const BAND = '.shell-panel[data-panel-side="list"] .shell-panel-header';
const TRIGGER = '[data-slot="overflow-actions-trigger"]';
// A folded cell stays mounted, out of flow and marked, so a door is shown only inside a cell that is not.
const SHOWN_CELL = '[data-slot="list-pane-action"] > :not([data-overflowed])';

const PLACES = [
  { place: "1280 wide, where the list is 272px", viewport: { width: 1280, height: 900 }, scale: 1 },
  { place: "1280 wide at 200% text", viewport: { width: 1280, height: 900 }, scale: 2 },
  { place: "1920 wide", viewport: { width: 1920, height: 1080 }, scale: 1 },
  { place: "a phone", viewport: PHONE, scale: 1 },
  { place: "a phone at 200% text", viewport: PHONE, scale: 2 },
] as const;

/** The shapes inside an icon's svg, which differ per glyph and not per size or tone. */
function glyphShapes(svg: Locator): Promise<string> {
  return svg.evaluate((element) => [...element.children].map((shape) => shape.outerHTML).join(""));
}

for (const { place, viewport, scale } of PLACES) {
  test(`the Presets band's Import door is shown by its name, as the file-import glyph, and not folded into More on ${place}`, async ({
    corpus,
    mount,
    page,
  }) => {
    await using root = await createCorpusHarness();
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
    await page.setViewportSize(viewport);
    await seedShellState(page, { activeSection: "presets" });
    await mount<typeof AppShellStory>(STORY, {});
    await setRootFontScale(page, FONT_SCALE_PROPERTY, scale);
    const band = page.locator(BAND);
    const importDoor = band.locator(SHOWN_CELL).getByRole("button", { name: PRESET_IMPORT_TITLE, exact: true });
    await expect(importDoor).toBeVisible();
    // The positive control for the absence below: nothing is in the menu, so there is no trigger to fold into.
    await expect(band.locator(TRIGGER)).toBeHidden();
    const shapes = await glyphShapes(importDoor.locator("svg"));
    await mount<typeof FileInputGlyphStory>(GLYPH_STORY, {});
    expect(shapes).toBe(await glyphShapes(page.getByRole("img", { name: "File-import glyph", exact: true })));
  });
}
