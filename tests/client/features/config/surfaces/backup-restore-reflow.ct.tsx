// The Backup and Restore page reflows at enlarged browser text: on a phone at 200% and 300% the settings column never scrolls
// sideways, so no element holds the page wider than its column (WCAG 1.4.10 reflow). A failure names each element that does.
// @subject packages/client/src/features/workloads/components/backup-export-section.tsx
// @subject packages/client/src/features/workloads/components/backup-import-section.tsx
// @subject packages/client/src/features/config/surfaces/config-content-surface.tsx
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { IMPORT_FILE_PICKER_NAME } from "#client/features/workloads/lib/import-library-names.ts";
import { EXPORT_DOWNLOAD_NAME } from "#client/features/workloads/lib/workloads-names.ts";
import type { CollectionCompositionStory } from "./_collection-composition-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_collection-composition-stories/CollectionCompositionStory";
const PHONE = { width: 390, height: 844 } as const;

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

for (const scale of PLATFORM_TEXT_SCALES.slice(1)) {
  test(`at ${String(scale * 100)}% text the Backup and Restore column does not scroll sideways`, async ({ browserName, mount, page }) => {
    test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
    await using _textSize = await setPlatformTextSize(page, scale);
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
    await routeTrpc(page, serveCorpusProcedures(caller, SECTION_PROCEDURES));
    await mount<typeof CollectionCompositionStory>(STORY, { group: "backup", width: PHONE.width, height: PHONE.height, appearance: {} });

    const column = page.locator('[data-slot="config-content"]');
    // The control: both halves of the page are on it, so the column measured below is the whole Backup and Restore page.
    await expect(column.getByRole("button", { name: EXPORT_DOWNLOAD_NAME, exact: true })).toBeVisible();
    await expect(column.getByLabel(IMPORT_FILE_PICKER_NAME, { exact: true })).toBeAttached();

    // An element widens the column when its box runs past the column's client edge (a scrollbar's width counts), or when its own
    // content, an unbreakable word in a box that fits, runs past its box and so past the edge with it.
    const reach = await column.evaluate((scroller, tolerance) => {
      const edge = scroller.getBoundingClientRect().left + scroller.clientWidth;
      const past = (element: Element): boolean => element.getBoundingClientRect().right > edge + tolerance;
      const clipped = (element: Element): boolean => {
        for (let up = element.parentElement; up !== null && up !== scroller; up = up.parentElement) {
          if (/auto|scroll|hidden|clip/u.test(getComputedStyle(up).overflowX)) {
            return true;
          }
        }
        return false;
      };
      const spills = (element: Element): boolean => element.scrollWidth > element.clientWidth + tolerance && getComputedStyle(element).overflowX === "visible";
      const widens = (element: Element): boolean => !clipped(element) && ((past(element) && ![...element.children].some(past)) || spills(element));
      // Only the deepest offender is named: every ancestor of a spilling leaf spills with it.
      const wideners = [...scroller.querySelectorAll("*")]
        .filter((element) => widens(element) && ![...element.querySelectorAll("*")].some(widens))
        .map(
          (element) =>
            `${element.tagName.toLowerCase()}[${element.getAttribute("data-slot") ?? ""}] "${element.textContent.slice(0, 24)}" box past by ${String(Math.round(element.getBoundingClientRect().right - edge))}, content past its box by ${String(element.scrollWidth - element.clientWidth)}`,
        );
      return { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth, wideners };
    }, LAYOUT_SUBPIXEL_PX);
    expect(reach.clientWidth).toBeGreaterThan(0);
    expect(reach.scrollWidth, `the column scrolls sideways; widened by ${JSON.stringify(reach.wideners)}`).toBeLessThanOrEqual(
      reach.clientWidth + LAYOUT_SUBPIXEL_PX,
    );
  });
}
