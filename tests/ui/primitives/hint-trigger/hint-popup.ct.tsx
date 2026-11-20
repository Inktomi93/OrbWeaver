// @subject packages/ui/src/primitives/hint-trigger/variants.ts
// A hint popup holds a word with no break point inside the popup at a phone's largest text: the popup does not scroll sideways and
// its text lies inside its box.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import { hintTriggerName } from "#ui/primitives/hint-trigger/hint-trigger-names.ts";
import type { HintBesideLabelStory } from "./_hint-popup-stories.tsx";

const STORY = "tests/ui/primitives/hint-trigger/_hint-popup-stories/HintBesideLabelStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const TEXT_SCALE_300 = 3;
const SUBJECT = "Reply length";
const UNBROKEN_HINT = "SamplerTemperatureAndTopPAndRepetitionPenaltyApplyBeforeTheFirstTokenIsChosen";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("a hint popup breaks a word with no break point inside itself at 300% text", async ({ mount, page }) => {
  await mount<typeof HintBesideLabelStory>(STORY, { subject: SUBJECT, hint: UNBROKEN_HINT });
  await setRootFontScale(page, FONT_SCALE_PROPERTY, TEXT_SCALE_300);
  await page.getByRole("button", { name: hintTriggerName(SUBJECT), exact: true }).click();
  const popup = page.getByRole("dialog", { name: hintTriggerName(SUBJECT), exact: true });
  await expect(popup).toBeVisible();
  await expect.poll(async () => popup.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(SUBPIXEL);
  const reach = await popup.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const text = range.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return { startPast: box.left - text.left, endPast: text.right - box.right };
  });
  expect(reach.startPast, "the text starts inside the popup").toBeLessThanOrEqual(SUBPIXEL);
  expect(reach.endPast, "the text ends inside the popup").toBeLessThanOrEqual(SUBPIXEL);
});
