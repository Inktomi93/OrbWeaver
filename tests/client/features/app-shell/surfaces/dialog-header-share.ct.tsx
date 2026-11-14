// A dialog header on a phone keeps to a share of the window at the largest browser text, in the production Add document modal
// ModalHost draws, in its centred dialog and its phone sheet. The centred dialog also keeps a long refusal line one scroll away.
// At the default text the sheet's header keeps its insets.
// @subject packages/ui/src/primitives/dialog/variants.ts
import { YOU_TAB_LABEL } from "@orb/client/lib";
import { EXTRACTION_OP_CODES, ExtractionTooLargeError } from "@orb/contracts/extraction";
import { DATABANK_UPLOAD_ROUTE } from "@orb/contracts/uploads";
import { PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { DOCUMENT_UPLOAD_FAILURE } from "#client/features/databank/lib/databank-upload-copy.ts";
import type { AppShellModalAsDrawerStory, AppShellModalStory, AppShellStory } from "./_app-shell-stories.tsx";
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

/** Opens the You sheet from the phone tab bar, the drawer ModalHost presents for the mobile tab. */
async function openYouSheet(page: Page, corpus: CorpusPlayback, open: () => Promise<unknown>): Promise<void> {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), [
    ...SECTION_PROCEDURES,
    "notifications.markAllRead",
    "plugin.list",
    "plugin.listSurfaces",
  ]);
  await open();
  await page.locator(".shell-rail").getByRole("button", { name: YOU_TAB_LABEL, exact: true }).click();
  await expect(page.getByRole("dialog", { name: YOU_TAB_LABEL, exact: true })).toBeVisible();
}

/** The sheet's scroll window less whatever pinned header and footer cover it, and the touch row's size where the sheet sits. */
function bodyRoomAgainstTouchRow(popup: HTMLElement, touchRowVar: string): { readonly window: number; readonly touchRow: number } {
  const scroller = popup.querySelector<HTMLElement>("[data-slot='drawer-content']");
  if (scroller === null) {
    throw new Error("The sheet needs its scroll region");
  }
  const pinnedHeight = (selector: string): number => {
    const row = scroller.querySelector<HTMLElement>(selector);
    return row !== null && getComputedStyle(row).position === "sticky" ? row.getBoundingClientRect().height : 0;
  };
  const probe = document.createElement("div");
  probe.style.blockSize = `var(${touchRowVar})`;
  // Out of flow, so the overflowing flex column cannot shrink the empty probe to nothing.
  probe.style.position = "absolute";
  scroller.append(probe);
  const touchRow = probe.getBoundingClientRect().height;
  probe.remove();
  return { window: scroller.clientHeight - pinnedHeight("[data-slot='dialog-header']") - pinnedHeight("[data-slot='dialog-footer']"), touchRow };
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
        // A long title wraps or gives Close its own line; it never pushes Close past the window's edge, and Close keeps its square target.
        expect(closeBox?.x ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(0);
        expect((closeBox?.x ?? 0) + (closeBox?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(viewport.width);
        expect(closeBox?.width).toBe(closeBox?.height);
      });
    }

    for (const [presentation, frame] of Object.entries(PRESENTATIONS)) {
      test(`one scroll of the ${presentation}'s body brings the refusal line's start into view, clear of the header and footer`, async ({
        corpus,
        mount,
        page,
      }) => {
        await using _textSize = await setPlatformTextSize(page, PLATFORM_TEXT_SCALES[2]);
        await refuseInAddDocument(
          page,
          corpus,
          (story) => mount<typeof AppShellModalStory | typeof AppShellModalAsDrawerStory>(story, { modalId: "addDocument" }),
          frame,
        );
        // The line can be taller than any phone window at this size, so only its start is owed: one scroll puts its top just under
        // the header, and its first line is then the element at that point.
        const reached = await page
          .locator(frame.popup)
          .locator(REFUSAL_LINE)
          .evaluate((node, headerSelector) => {
            let scroller = node.parentElement;
            while (scroller !== null && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/u.test(getComputedStyle(scroller).overflowY))) {
              scroller = scroller.parentElement;
            }
            const pinned = node.closest("[data-slot$='-popup']")?.querySelector(headerSelector);
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
    }

    test("the You sheet leaves its body at least one touch row of scroll room under its pinned chrome", async ({ corpus, mount, page }) => {
      await using _textSize = await setPlatformTextSize(page, PLATFORM_TEXT_SCALES[2]);
      await openYouSheet(page, corpus, () => mount<typeof AppShellStory>(`${SHELL_STORIES}/AppShellStory`, {}));
      const room = await page.locator(PRESENTATIONS.drawer.popup).evaluate(bodyRoomAgainstTouchRow, TOKENS["size.touch-target"].cssVar);
      expect(room.touchRow).toBeGreaterThan(0);
      expect(room.window).toBeGreaterThanOrEqual(room.touchRow);
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
    // The header and the commit row stay pinned at this size: the sheet is not tiny, and the screen is wider than 30rem.
    await expect(header).toHaveCSS("position", "sticky");
    await expect(page.locator(PRESENTATIONS.drawer.popup).locator('[data-slot="dialog-footer"]')).toHaveCSS("position", "sticky");
  });
});

// The phone tab bar, and so the You sheet, exists only in the phone shell, which a landscape phone at the default text is not.
test.describe("a portrait phone at the default text", () => {
  test.use({ viewport: PHONE_WINDOWS[1].viewport, isMobile: true, hasTouch: true });

  test("the You sheet keeps its pinned header, its inset above the close control, and its whole title beside Close", async ({ corpus, mount, page }) => {
    await openYouSheet(page, corpus, () => mount<typeof AppShellStory>(`${SHELL_STORIES}/AppShellStory`, {}));
    const header = page.locator(PRESENTATIONS.drawer.popup).locator(HEADER);
    const title = header.getByRole("heading", { name: YOU_TAB_LABEL, exact: true });
    await expect(header).toHaveCSS("position", "sticky");
    await expect(title).not.toHaveCSS("text-overflow", "ellipsis");
    const [headerBox, closeBox, titleBox] = await Promise.all([header.boundingBox(), header.getByRole("button").boundingBox(), title.boundingBox()]);
    expect((closeBox?.y ?? 0) - (headerBox?.y ?? 0)).toBeGreaterThan(0);
    // One line: Close sits beside the title, not under it.
    expect(closeBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan((titleBox?.y ?? 0) + (titleBox?.height ?? 0));
  });
});
