// The Textarea's autosize with the browser's `field-sizing: content` taken away: the script arm must size the box
// to the same height the native arm gives it, inside the same min and max rows.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { AutosizeTextareaStory, ClassFixedLaterStory, FixedClassHeightStory, FixedInlineHeightStory } from "./textarea-autosize-stories.tsx";

const STORIES = "tests/ui/primitives/textarea/textarea-autosize-stories";
const STORY = `${STORIES}/AutosizeTextareaStory`;
const FOUR_LINES = "a\nb\nc\nd";
const TWELVE_LINES = Array.from({ length: 12 }, (_, line) => `line ${String(line)}`).join("\n");
// Sub-pixel line boxes round differently in the two arms.
const SLACK = 1;

/** The box the native arm gives the same text: a sibling clone with the property forced on and no height set. */
function nativeHeight(field: Locator): Promise<number> {
  return field.evaluate((element: HTMLTextAreaElement) => {
    const clone = element.cloneNode(true) as HTMLTextAreaElement;
    clone.style.height = "";
    clone.style.setProperty("field-sizing", "content", "important");
    clone.value = element.value;
    element.after(clone);
    const height = clone.getBoundingClientRect().height;
    clone.remove();
    return height;
  });
}

function ownHeight(field: Locator): Promise<number> {
  return field.evaluate((element) => element.getBoundingClientRect().height);
}

test.describe("without field-sizing support", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Firefox 138 to 151 has neither the property nor the typed style map, so the script arm may use only getComputedStyle.
      Reflect.deleteProperty(Element.prototype, "computedStyleMap");
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...args: [string, string?]): boolean => (args[0] === "field-sizing" ? false : supports(...(args as [string])));
      // The skin's class still asks for the property and this browser has it, so it is switched off to leave the script alone.
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "textarea { field-sizing: fixed !important; }";
        document.head.append(style);
      });
    });
  });

  test("the box is sized before the first paint, grows with its text, and stops at its rows", async ({ mount }) => {
    const component = await mount<typeof AutosizeTextareaStory>(STORY);
    const field = component.getByRole("textbox", { name: "Notes", exact: true });
    expect(Math.abs((await ownHeight(field)) - (await nativeHeight(field)))).toBeLessThanOrEqual(SLACK);
    const heights: number[] = [];
    for (const text of ["", FOUR_LINES, TWELVE_LINES]) {
      await field.fill(text);
      expect(Math.abs((await ownHeight(field)) - (await nativeHeight(field))), JSON.stringify(text)).toBeLessThanOrEqual(SLACK);
      heights.push(await ownHeight(field));
    }
    const [empty = 0, four = 0, twelve = 0] = heights;
    expect(four).toBeGreaterThan(empty);
    expect(twelve).toBeGreaterThan(four);
    // Past its rows the box stops growing and scrolls, as the native arm does.
    expect(await field.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  });

  test("a height the caller fixes, inline or by class, is kept", async ({ mount }) => {
    const inline = await mount<typeof FixedInlineHeightStory>(`${STORIES}/FixedInlineHeightStory`);
    const inlineField = inline.getByRole("textbox", { name: "Fixed inline", exact: true });
    await expect(inlineField).toHaveCSS("height", "40px");
    await inlineField.fill("a\nb\nc\nd\ne\nf\ng");
    await expect(inlineField).toHaveCSS("height", "40px");
    const byClass = await mount<typeof FixedClassHeightStory>(`${STORIES}/FixedClassHeightStory`);
    const classField = byClass.getByRole("textbox", { name: "Fixed class", exact: true });
    expect(await classField.evaluate((element) => element.style.height)).toBe("");
    expect(await classField.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  });

  test("an inline height the caller removes after mount lets the box size to its text with no further input", async ({ mount }) => {
    const component = await mount<typeof FixedInlineHeightStory>(`${STORIES}/FixedInlineHeightStory`);
    const field = component.getByRole("textbox", { name: "Fixed inline", exact: true });
    await expect(field).toHaveCSS("height", "40px");
    await field.evaluate((element) => element.style.removeProperty("height"));
    await expect.poll(async () => Math.abs((await ownHeight(field)) - (await nativeHeight(field)))).toBeLessThanOrEqual(SLACK);
    expect(await ownHeight(field)).toBeGreaterThan(40);
  });

  test("a removed inline height that equals the box's rows height still lets it size to its text", async ({ mount }) => {
    const component = await mount<typeof FixedInlineHeightStory>(`${STORIES}/FixedInlineHeightStory`);
    const field = component.getByRole("textbox", { name: "Fixed inline", exact: true });
    // Pin the inline height to the height the box has with no height set, so removing it moves no edge and no observer fires.
    const rowsHeight = await field.evaluate((element) => {
      element.style.height = "auto";
      const height = element.getBoundingClientRect().height;
      element.style.height = `${String(height)}px`;
      return height;
    });
    await field.evaluate((element) => element.style.removeProperty("height"));
    await expect.poll(() => ownHeight(field)).toBeGreaterThan(rowsHeight + SLACK);
    expect(Math.abs((await ownHeight(field)) - (await nativeHeight(field)))).toBeLessThanOrEqual(SLACK);
  });

  test("a height class added after mount wins over the script's height, and one removed lets it size again", async ({ mount }) => {
    const component = await mount<typeof ClassFixedLaterStory>(`${STORIES}/ClassFixedLaterStory`);
    const field = component.getByRole("textbox", { name: "Fixed later", exact: true });
    const toggle = component.getByRole("button", { name: "Toggle fixed height", exact: true });
    const grown = await ownHeight(field);
    await toggle.click();
    await expect.poll(() => field.evaluate((element) => element.style.height)).toBe("");
    expect(await ownHeight(field)).toBeLessThan(grown);
    await toggle.click();
    await expect.poll(() => ownHeight(field)).toBe(grown);
  });
});
