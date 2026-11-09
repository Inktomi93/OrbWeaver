// @subject packages/ui/src/primitives/button/variants.ts
// The primitives at the phone's enlarged text: labels wrap between words, a full dialog keeps its title's line, an end-aligned
// control that outgrows its line stays reachable, a popup fits the screen, and a stepped number field keeps its input box.
import { enlargedTextFindings as findings, LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { EndRowStory, FullDialogStory, LabelsStory, NumberRowStory, PopoverFieldsStory } from "./_enlarged-text-stories.tsx";

const STORIES = "tests/ui/primitives/_enlarged-text-stories";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const SCALES = [2, 3] as const;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

for (const factor of SCALES) {
  test.describe(`at ${factor * 100}% text`, () => {
    test("Button and Toggle labels wrap between words and stay inside a phone column", async ({ mount, page }) => {
      const component = await mount<typeof LabelsStory>(`${STORIES}/LabelsStory`, {});
      await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
      const column = component.locator('[data-probe="column"]');
      await expect
        .poll(async () => {
          const within = await column.boundingBox();
          const boxes = await Promise.all((await column.locator("button").all()).map((control) => control.boundingBox()));
          return within !== null && boxes.every((box) => box !== null && box.x + box.width <= within.x + within.width + SUBPIXEL);
        })
        .toBe(true);
      expect(await findings(column)).toEqual([]);
      // A label that wrapped is not cut: every control paints the lines it holds.
      const cut = await column
        .locator("button")
        .evaluateAll((controls) => controls.filter((control) => control.scrollHeight > control.clientHeight + 1).map((control) => control.textContent));
      expect(cut).toEqual([]);
    });

    test("a full dialog's truncating title keeps its whole line", async ({ mount, page }) => {
      await mount<typeof FullDialogStory>(`${STORIES}/FullDialogStory`, {});
      await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
      const title = page.getByRole("heading", { name: "Rewrite the reply", exact: true });
      await expect(title).toBeVisible();
      const { line, box } = await title.evaluate((node) => ({
        line: Number.parseFloat(getComputedStyle(node).lineHeight),
        box: node.getBoundingClientRect().height,
      }));
      expect(box).toBeGreaterThanOrEqual(line - SUBPIXEL);
    });

    test("an end-aligned control wider than its line is reachable from the start of its scroller", async ({ mount, page }) => {
      const component = await mount<typeof EndRowStory>(`${STORIES}/EndRowStory`, {});
      await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
      const scroller = component.locator('[data-probe="scroller"]');
      const control = component.getByRole("button", { name: "Add selected", exact: true });
      await expect
        .poll(async () => {
          const [within, box] = await Promise.all([scroller.boundingBox(), control.boundingBox()]);
          return within !== null && box !== null && box.width > within.width && box.x >= within.x - SUBPIXEL;
        })
        .toBe(true);
    });

    test("the dialog foot holds its over-wide control at the start edge", async ({ mount, page }) => {
      await mount<typeof FullDialogStory>(`${STORIES}/FullDialogStory`, {});
      await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
      const footer = page.locator('[data-slot="dialog-footer"]');
      const control = footer.getByRole("button", { name: "Fetch and add", exact: true });
      await expect
        .poll(async () => {
          const [within, box] = await Promise.all([footer.boundingBox(), control.boundingBox()]);
          return within !== null && box !== null && box.width > within.width && box.x >= within.x - SUBPIXEL;
        })
        .toBe(true);
    });

    test("a popover popup fits the room the screen leaves", async ({ mount, page }) => {
      await mount<typeof PopoverFieldsStory>(`${STORIES}/PopoverFieldsStory`, {});
      await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
      await page.getByRole("button", { name: "Pick color", exact: true }).click();
      const popup = page.locator('[data-slot="popover-popup"]');
      await expect(popup).toBeVisible();
      await expect
        .poll(async () => {
          const box = await popup.boundingBox();
          return box !== null && box.x >= -SUBPIXEL && box.x + box.width <= 390 + SUBPIXEL;
        })
        .toBe(true);
      expect(await findings(popup)).toEqual([]);
    });

    test("a stepped number field keeps a readable input box beside its sibling", async ({ mount, page }) => {
      const component = await mount<typeof NumberRowStory>(`${STORIES}/NumberRowStory`, {});
      await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
      const input = component.getByRole("textbox", { name: "Count", exact: true });
      const step = await component.locator('[data-probe="control-md"]').evaluate((node) => node.getBoundingClientRect().height);
      await expect.poll(async () => (await input.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(step);
    });
  });
}
