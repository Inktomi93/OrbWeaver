// The Settings "Customize this look" disclosure reflows at every browser text size: on a phone its caption takes a line of its
// own under the label when the two do not fit side by side, and wraps between its words, so the settings column never scrolls
// sideways (WCAG 1.4.10 reflow).
// @subject packages/client/src/features/config/surfaces/config-content-surface.tsx
// @subject packages/client/src/features/config/components/looks-fold-caption.tsx
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CONFIG_CUSTOMIZE_LOOK_NAME } from "#client/features/config/lib/config-control-names.ts";
import type { CollectionCompositionStory } from "./_collection-composition-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_collection-composition-stories/CollectionCompositionStory";
const PHONE = { width: 390, height: 844 } as const;

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

for (const scale of PLATFORM_TEXT_SCALES) {
  test(`at ${String(scale * 100)}% text the look disclosure fits the Settings column`, async ({ browserName, mount, page }) => {
    test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
    await using _textSize = await setPlatformTextSize(page, scale);
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
    await routeTrpc(page, serveCorpusProcedures(caller, SECTION_PROCEDURES));
    await mount<typeof CollectionCompositionStory>(STORY, { group: "appearance", width: PHONE.width, height: PHONE.height, appearance: {} });

    const column = page.locator('[data-slot="config-content"]');
    const trigger = column.getByRole("button", { name: CONFIG_CUSTOMIZE_LOOK_NAME });
    // The control: the disclosure is on the pane, so the column measured below holds it.
    await expect(trigger).toBeVisible();
    const triggerEnd = await trigger.evaluate((button) => button.getBoundingClientRect().right);
    const fit = await column.evaluate((scroller) => ({
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      edge: scroller.getBoundingClientRect().left + scroller.clientWidth,
    }));
    expect(fit.clientWidth).toBeGreaterThan(0);
    expect(triggerEnd, "the disclosure ends past the column's edge").toBeLessThanOrEqual(fit.edge + LAYOUT_SUBPIXEL_PX);
    expect(fit.scrollWidth, "the Settings column scrolls sideways").toBeLessThanOrEqual(fit.clientWidth + LAYOUT_SUBPIXEL_PX);
  });
}
