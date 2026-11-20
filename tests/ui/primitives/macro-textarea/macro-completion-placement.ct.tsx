// @subject packages/ui/src/primitives/macro-textarea/macro-textarea.tsx
// The completion list stays on screen on a phone: below the field while the visual viewport leaves room,
// above it when it does not, and inside whatever a soft keyboard leaves.
import { emulateSoftKeyboard } from "@orb/testkit/ct";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { MACRO_SUGGESTIONS_NAME } from "#ui/primitives/macro-textarea/macro-textarea-names.ts";
import type { MacroCompletionPlacementStory } from "./_macro-completion-placement-stories.tsx";

const STORY = "tests/ui/primitives/macro-textarea/_macro-completion-placement-stories/MacroCompletionPlacementStory";
// Tall enough that the room under a field at the top is shorter than the list's own height.
const KEYBOARD_PX = 440;
const LOW_KEYBOARD_PX = 240;
// Enough lines to run the field past the viewport, which is what a long description does on a phone.
const LONG_FIELD_LINES = 40;

test.use({ viewport: { width: 430, height: 740 }, hasTouch: true, isMobile: true });

interface Box {
  readonly top: number;
  readonly bottom: number;
}

/** Types the trigger and returns the field and its open list. */
async function openList(component: Locator): Promise<{ field: Locator; list: Locator }> {
  const field = component.getByRole("textbox", { name: "Macro field", exact: true });
  await field.pressSequentially("{{");
  const list = component.getByRole("listbox", { name: MACRO_SUGGESTIONS_NAME, exact: true });
  await expect(list).toBeVisible();
  return { field, list };
}

async function boxOf(node: Locator): Promise<Box> {
  const box = await node.boundingBox();
  if (box === null) {
    throw new Error("The measured node has no box");
  }
  return { top: box.y, bottom: box.y + box.height };
}

function visibleBottom(page: Page): Promise<number> {
  return page.evaluate(() => (window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? window.innerHeight));
}

/** The list and its first option both sit fully inside the visible band. The list is seated by the floating layer after it paints, so
 *  the placement is polled, and a list that never gets inside names what stays outside. */
async function expectOnScreen(list: Locator, bottom: () => Promise<number>): Promise<void> {
  await expect
    .poll(
      async () => {
        const [box, first, band] = [await boxOf(list), await boxOf(list.getByRole("option").first()), await bottom()];
        const checks: readonly (readonly [string, boolean])[] = [
          ["the list starts above the screen", box.top >= 0],
          ["the list ends below the visible band", box.bottom <= band],
          ["the first option starts above the list", first.top >= box.top],
          ["the first option ends below the list", first.bottom <= box.bottom],
        ];
        return checks.filter(([, holds]) => !holds).map(([fault]) => fault);
      },
      { message: "the completion list's place on screen" },
    )
    .toEqual([]);
}

test("a field with room below keeps its list below", async ({ mount, page }) => {
  const { field, list } = await openList(await mount<typeof MacroCompletionPlacementStory>(STORY, { sits: "start" }));
  await expect
    .poll(async () => (await boxOf(list)).top - (await boxOf(field)).bottom, { message: "the list's top against the field's bottom" })
    .toBeGreaterThanOrEqual(0);
  await expectOnScreen(list, () => visibleBottom(page));
});

test("a field at the bottom edge puts its list above it", async ({ mount, page }) => {
  const { field, list } = await openList(await mount<typeof MacroCompletionPlacementStory>(STORY, { sits: "end" }));
  await expect
    .poll(async () => (await boxOf(field)).top - (await boxOf(list)).bottom, { message: "the field's top against the list's bottom" })
    .toBeGreaterThanOrEqual(0);
  await expectOnScreen(list, () => visibleBottom(page));
});

test("a soft keyboard that covers the room below leaves the list inside the visible viewport", async ({ mount, page }) => {
  const { list } = await openList(await mount<typeof MacroCompletionPlacementStory>(STORY, { sits: "start" }));
  await emulateSoftKeyboard(page, KEYBOARD_PX);
  expect(await visibleBottom(page)).toBeLessThan(740);
  await expect.poll(async () => (await boxOf(list)).bottom <= (await visibleBottom(page))).toBe(true);
  await expectOnScreen(list, () => visibleBottom(page));
});

test("a list already open flips above its field when the keyboard rises over the room below", async ({ mount, page }) => {
  const { field, list } = await openList(await mount<typeof MacroCompletionPlacementStory>(STORY, { sits: "middle" }));
  expect((await boxOf(list)).top).toBeGreaterThanOrEqual((await boxOf(field)).bottom);
  await emulateSoftKeyboard(page, LOW_KEYBOARD_PX);
  await expect.poll(async () => (await boxOf(list)).bottom <= (await boxOf(field)).top).toBe(true);
  await expectOnScreen(list, () => visibleBottom(page));
});

test("a field grown taller than the room a keyboard leaves seats its list inside the visible band", async ({ mount, page }) => {
  const { field, list } = await openList(await mount<typeof MacroCompletionPlacementStory>(STORY, { sits: "start", lines: LONG_FIELD_LINES }));
  await emulateSoftKeyboard(page, KEYBOARD_PX);
  const band = await visibleBottom(page);
  expect((await boxOf(field)).bottom).toBeGreaterThan(band);
  await expect.poll(async () => (await boxOf(list)).bottom <= band).toBe(true);
  await expectOnScreen(list, () => Promise.resolve(band));
  await expect(list.getByRole("option").first()).toBeInViewport({ ratio: 1 });
});

test("a clamped list scrolls the highlighted option into view", async ({ mount, page }) => {
  const { field, list } = await openList(await mount<typeof MacroCompletionPlacementStory>(STORY, { sits: "start" }));
  await emulateSoftKeyboard(page, KEYBOARD_PX);
  const options = list.getByRole("option");
  const count = await options.count();
  for (let step = 1; step < count; step += 1) {
    await field.press("ArrowDown");
  }
  const active = await boxOf(options.nth(count - 1));
  const frame = await boxOf(list);
  expect(active.bottom).toBeLessThanOrEqual(frame.bottom);
  expect(active.top).toBeGreaterThanOrEqual(frame.top);
});
