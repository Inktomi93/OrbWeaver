// The regex editor's pipeline stages stay inside the settings column on a phone at the browser's 200% and 300% text sizes: a stage's
// kicker band, with the "this script" marker the run appends for a script outside the always-on set, wraps instead of pushing the band's rule
// past the stage, so the column never scrolls sideways (WCAG 1.4.10 reflow).
// @subject packages/client/src/features/regex/components/regex-pipeline-panel.tsx
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { RegexMemberSaveStory } from "./_member-save-stories.tsx";

const STORY = "tests/client/features/regex/surfaces/_member-save-stories/RegexMemberSaveStory";
const CONTENT = '[data-slot="config-content"]';
const STAGE = '[data-slot="regex-pipeline-stage"]';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const scale of [PLATFORM_TEXT_SCALES[1], PLATFORM_TEXT_SCALES[2]]) {
  test(`the settings column holds the regex pipeline stages without scrolling sideways at ${scale * 100}% text`, async ({ mount, page, browserName }) => {
    test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
    await using _textSize = await setPlatformTextSize(page, scale);
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    // A script that no scope attaches is not in the always-on set, so its stage carries the long appended-arm marker.
    const script = await caller.regex.createScript({ input: { name: "Pipeline witness", findRegex: "witness", replaceString: "", placement: ["AI_OUTPUT"] } });
    await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "regex.listScripts", "regex.listGlobal", "regex.updateScript"]));
    await mount<typeof RegexMemberSaveStory>(STORY, { scriptId: script.id });
    // Positive control: the stage is drawn with its marker, so the bound below is measured on the band that overflowed.
    // Only the subject's own stage carries the marker; the always-on stages above it do not.
    const stage = page.locator(STAGE).filter({ has: page.locator('[data-slot="badge"]') });
    await expect(stage).toBeAttached();
    const reach = await page.locator(CONTENT).evaluate((column) => ({ visible: column.clientWidth, content: column.scrollWidth }));
    expect(reach.visible).toBeGreaterThan(0);
    expect(reach.content).toBeLessThanOrEqual(reach.visible + LAYOUT_SUBPIXEL_PX);
  });
}
