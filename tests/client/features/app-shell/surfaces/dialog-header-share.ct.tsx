// A dialog header on a phone keeps to a share of the window at the largest browser text, in the production Add document modal
// ModalHost draws, in its centred dialog and its phone sheet. The centred dialog also keeps a long refusal line one scroll away.
// At the default text the sheet's header keeps its insets.
// @subject packages/ui/src/primitives/dialog/variants.ts
import { EXTRACTION_OP_CODES, ExtractionTooLargeError } from "@orb/contracts/extraction";
import { DATABANK_UPLOAD_ROUTE } from "@orb/contracts/uploads";
import { PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { DOCUMENT_UPLOAD_FAILURE } from "#client/features/databank/lib/databank-upload-copy.ts";
import type { AppShellModalAsDrawerStory, AppShellModalStory } from "./_app-shell-stories.tsx";
import { MODAL_SHELL_READS, routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const FILE_INPUT = 'input[type="file"]';
const HEADER = '[data-slot="dialog-header"]';
const REFUSAL_LINE = '[data-slot="file-dropzone-error"]';
// The longest sentence the upload zone can show.
const LONG_REFUSAL = DOCUMENT_UPLOAD_FAILURE[EXTRACTION_OP_CODES.tooLarge];
// The most of a phone window a header may hold at the largest text.
const HEADER_WINDOW_SHARE = 0.4;

const PRESENTATIONS = {
  dialog: { story: `${SHELL_STORIES}/AppShellModalStory`, popup: '[data-slot="dialog-popup"]' },
  drawer: { story: `${SHELL_STORIES}/AppShellModalAsDrawerStory`, popup: '[data-slot="drawer-popup"]' },
} as const;
type Frame = (typeof PRESENTATIONS)[keyof typeof PRESENTATIONS];

const PHONE_WINDOWS = [
  { name: "a landscape phone", viewport: { width: 932, height: 430 } },
  { name: "a portrait phone", viewport: { width: 430, height: 740 } },
] as const;

/** Opens Add document in `frame` with every upload refused as too large, and picks a file so the refusal line shows. */
async function refuseInAddDocument(page: Page, corpus: CorpusPlayback, open: (story: string) => Promise<unknown>, frame: Frame): Promise<void> {
  await page.route(`**${DATABANK_UPLOAD_ROUTE}`, (route) =>
    route.fulfill({ status: 400, json: { error: new ExtractionTooLargeError("epub").message, reason: EXTRACTION_OP_CODES.tooLarge } }),
  );
  await using root = await createCorpusHarness();
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), MODAL_SHELL_READS);
  await open(frame.story);
  const popup = page.locator(frame.popup);
  await popup.locator(FILE_INPUT).setInputFiles({ name: "ledger.txt", mimeType: "text/plain", buffer: Buffer.from("The lantern.") });
  await expect(popup.locator(REFUSAL_LINE)).toHaveText(LONG_REFUSAL);
}

for (const { name, viewport } of PHONE_WINDOWS) {
  test.describe(`${name} at the largest browser text`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });
    test.beforeEach(({ browserName }) => {
      test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
    });

    for (const [presentation, frame] of Object.entries(PRESENTATIONS)) {
      test(`the ${presentation}'s header holds at most its share of the window`, async ({ corpus, mount, page }) => {
        await using _textSize = await setPlatformTextSize(page, PLATFORM_TEXT_SCALES[2]);
        await refuseInAddDocument(
          page,
          corpus,
          (story) => mount<typeof AppShellModalStory | typeof AppShellModalAsDrawerStory>(story, { modalId: "addDocument" }),
          frame,
        );
        const header = page.locator(frame.popup).locator(HEADER);
        const headerBox = await header.boundingBox();
        expect(headerBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(viewport.height * HEADER_WINDOW_SHARE);
        // The share is kept by giving up insets, never the close control: it is still drawn, at its full block size.
        const closeBox = await header.getByRole("button").boundingBox();
        expect(closeBox?.height ?? 0).toBeGreaterThan(0);
        expect(closeBox?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(headerBox?.y ?? 0);
      });
    }

    test("one scroll of the dialog's body brings the refusal line's start into view, clear of the header and footer", async ({ corpus, mount, page }) => {
      await using _textSize = await setPlatformTextSize(page, PLATFORM_TEXT_SCALES[2]);
      await refuseInAddDocument(page, corpus, (story) => mount<typeof AppShellModalStory>(story, { modalId: "addDocument" }), PRESENTATIONS.dialog);
      // The line can be taller than any phone window at this size, so only its start is owed: one scroll puts its top just under
      // the header, and its first line is then the element at that point.
      const reached = await page
        .locator(PRESENTATIONS.dialog.popup)
        .locator(REFUSAL_LINE)
        .evaluate((node, headerSelector) => {
          let scroller = node.parentElement;
          while (scroller !== null && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/u.test(getComputedStyle(scroller).overflowY))) {
            scroller = scroller.parentElement;
          }
          const pinned = node.closest("[data-slot='dialog-popup']")?.querySelector(headerSelector);
          if (scroller === null || pinned === null || pinned === undefined) {
            throw new Error("The dialog needs a scrolling body and a header");
          }
          const headerBottom = Math.max(pinned.getBoundingClientRect().bottom, scroller.getBoundingClientRect().top);
          scroller.scrollTop += node.getBoundingClientRect().top - headerBottom;
          const box = node.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + Number.parseFloat(getComputedStyle(node).lineHeight) / 2);
          return hit !== null && node.contains(hit);
        }, HEADER);
      expect(reached).toBe(true);
    });
  });
}

test.describe("a landscape phone at the default text", () => {
  test.use({ viewport: PHONE_WINDOWS[0].viewport, isMobile: true, hasTouch: true });

  test("the sheet's header keeps its inset above the close control", async ({ corpus, mount, page }) => {
    await refuseInAddDocument(page, corpus, (story) => mount<typeof AppShellModalAsDrawerStory>(story, { modalId: "addDocument" }), PRESENTATIONS.drawer);
    const header = page.locator(PRESENTATIONS.drawer.popup).locator(HEADER);
    const [headerBox, closeBox] = await Promise.all([header.boundingBox(), header.getByRole("button").boundingBox()]);
    expect((closeBox?.y ?? 0) - (headerBox?.y ?? 0)).toBeGreaterThan(0);
  });
});
