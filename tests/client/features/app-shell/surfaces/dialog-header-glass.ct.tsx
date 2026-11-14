// A landscape phone's dialog pins its header and its footer over the scrolling body. With glass on, the header is the same
// glass row as the footer: no fill of its own, the footer's backdrop blur, and the body text scrolled under it stays under
// it. The dialog is the production Add document modal that ModalHost draws.
// @subject packages/client/src/styles/globals.css
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { DATABANK_INGEST_GLOSS } from "#client/features/databank/lib/databank-copy.ts";
import type { AppShellModalStory } from "./_app-shell-stories.tsx";
import { MODAL_SHELL_READS, routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellModalStory`;
const POPUP = '[data-slot="dialog-popup"]';
const HEADER = '[data-slot="dialog-header"]';
const FOOTER = '[data-slot="dialog-footer"]';

/** The alpha of the located element's fill, read through a canvas so any colour syntax the engine serializes resolves. */
function paintOf(locator: Locator): Promise<{ readonly alpha: number; readonly blur: string }> {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);
    const context = document.createElement("canvas").getContext("2d");
    if (context === null) {
      throw new Error("A 2d canvas is needed to read the fill");
    }
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return { alpha: context.getImageData(0, 0, 1, 1).data[3] ?? Number.NaN, blur: style.backdropFilter };
  });
}

test.describe("a landscape phone with glass on", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test("the pinned header has no opaque fill, blurs like the footer, and covers the body text scrolled under it", async ({ corpus, mount, page }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference", forcedColors: "none" });
    await using root = await createCorpusHarness();
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), MODAL_SHELL_READS);
    await mount<typeof AppShellModalStory>(STORY, { modalId: "addDocument" });
    const popup = page.locator(POPUP);
    const header = popup.locator(HEADER);
    const footer = popup.locator(FOOTER);
    // The landscape regime is the one whose header is pinned; at any other size this case would measure a header that scrolls away.
    await expect(header).toHaveCSS("position", "sticky");

    const [headerPaint, footerPaint] = await Promise.all([paintOf(header), paintOf(footer)]);
    // Positive control: the footer's blur proves the glass is on for modals.
    expect(footerPaint.blur).not.toBe("none");
    expect(headerPaint).toEqual({ alpha: 0, blur: footerPaint.blur });

    // Scroll the teaching sentence up until its first line sits under the header, then hit-test that line's point.
    const gloss = popup.getByText(DATABANK_INGEST_GLOSS, { exact: true });
    const covered = await gloss.evaluate((node) => {
      const pinned = node.closest('[data-slot="dialog-popup"]')?.querySelector<HTMLElement>('[data-slot="dialog-header"]');
      // The box that scrolls the body, whichever of the popup's descendants the regime made it.
      let scroller = node.parentElement;
      while (scroller !== null && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/u.test(getComputedStyle(scroller).overflowY))) {
        scroller = scroller.parentElement;
      }
      if (scroller === null || pinned === null || pinned === undefined) {
        throw new Error("The dialog needs a scrolling body and a header");
      }
      const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
      scroller.scrollTop += node.getBoundingClientRect().top - pinned.getBoundingClientRect().bottom + lineHeight;
      const line = node.getBoundingClientRect();
      const bar = pinned.getBoundingClientRect();
      const y = Math.max(line.top, bar.top) + 1;
      const under = line.top < bar.bottom && line.bottom > bar.bottom;
      const hit = document.elementFromPoint(line.left + line.width / 2, y);
      return { under, inHeader: hit !== null && pinned.contains(hit) };
    });
    // Positive control: the sentence really runs under the header, so the hit test reads the header over text.
    expect(covered.under).toBe(true);
    expect(covered.inHeader).toBe(true);
  });
});
