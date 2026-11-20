// @subject packages/client/src/features/user-admin/components/about-section.tsx
// The About page's update check holds the screen's width at the largest browser text on a phone: the check button and the verdict beside it (a status
// badge and the sentence that makes it actionable) wrap onto further lines instead of running past the column's end edge.
import type { UpdateCheck } from "@orb/kit/version-identity";
import type { SettingsCompositionStory } from "@orb/testkit/browser";
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize, sidewaysReach } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";

const STORY = "tests/support/browser/ct-settings-composition-stories/SettingsCompositionStory";
const PHONE = { width: 390, height: 844 } as const;
// The upstream probe is the one external edge: a GitHub read the page asks for by name.
const BEHIND: UpdateCheck = {
  status: "behind",
  reason: null,
  remote: { channel: "main", commit: "0123456789abcdef", short: "0123456", committedAt: "2026-01-02T03:04:05Z" },
};

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

for (const scale of PLATFORM_TEXT_SCALES) {
  test(`at ${String(scale * 100)}% text the update verdict stays inside the screen`, async ({ browserName, mount, page }) => {
    test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
    await using _textSize = await setPlatformTextSize(page, scale);
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, { ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]), "settings.checkForUpdate": BEHIND });
    await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "about-updates", width: PHONE.width });
    await page.getByRole("button", { name: /^check for updates$/iu }).click();
    await expect(page.getByText("Update available", { exact: true })).toBeVisible();
    const reach = await page.locator("body").evaluate(sidewaysReach);
    expect(reach.wideners).toEqual([]);
    expect(reach.scrolls).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
  });
}
