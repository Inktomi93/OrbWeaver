// @subject packages/ui/src/primitives/copy-button/variants.ts
// The About page's version line is the subject of a copy button: at a phone's largest text it breaks inside the column the page seats it in,
// so the column does not scroll sideways and the line's text lies inside the column.
import { testId } from "@orb/client/lib";
import type { SettingsCompositionStory } from "@orb/testkit/browser";
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";

const STORY = "tests/support/browser/ct-settings-composition-stories/SettingsCompositionStory";
const ABOUT_VERSION_SECTION = "about-version";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const TEXT_SCALE_300 = 3;
const PHONE_WIDTH = 390;
// The usable pane width at a 390px phone once the production pane inset (`paneInset`) is taken off both sides.
const PHONE_PANE_WIDTH = 342;

test.use({ viewport: { width: PHONE_WIDTH, height: 844 }, hasTouch: true, isMobile: true });

test("the version line breaks inside the About column at 300% text", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.getVersion"]));
  await mount<typeof SettingsCompositionStory>(STORY, { sectionId: ABOUT_VERSION_SECTION, width: PHONE_PANE_WIDTH, paneInset: true });
  await setRootFontScale(page, FONT_SCALE_PROPERTY, TEXT_SCALE_300);
  const column = page.getByTestId(testId("aboutSection"));
  const line = page.getByTestId(testId("aboutVersionLine"));
  await expect(line).toBeVisible();
  await expect.poll(async () => column.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(SUBPIXEL);
  const text = await line.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const { left, right } = range.getBoundingClientRect();
    return { left, right };
  });
  const box = await column.boundingBox();
  if (box === null) {
    throw new Error("The About column must paint");
  }
  expect(box.x - text.left, "the line's text starts inside the column").toBeLessThanOrEqual(SUBPIXEL);
  expect(text.right - (box.x + box.width), "the line's text ends inside the column").toBeLessThanOrEqual(SUBPIXEL);
});
