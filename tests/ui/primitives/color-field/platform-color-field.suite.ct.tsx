// ColorField keeps a draft apart from the committed value: only a renderable color commits, clear is explicit, and a stale draft never resurfaces.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { CommittedColorStory } from "./color-field-stories.tsx";

const STORY = "tests/ui/primitives/color-field/color-field-stories/CommittedColorStory";
const START = "teal";

const trigger = (page: Page): Locator => page.locator('[data-slot="color-field-trigger"]');
const popup = (page: Page): Locator => page.locator('[data-slot="popover-popup"]');
// The native color input reports as a textbox too; the hex text field is the Input primitive inside the popup.
const hex = (page: Page): Locator => popup(page).locator('[data-slot="input-root"]');
const committed = (page: Page): Locator => page.getByRole("status", { name: "Committed color" });
const commits = (page: Page): Locator => page.getByRole("status", { name: "Commit count" });

test("a renderable color commits as typed and an unrenderable one never reaches the caller", async ({ mount, page }) => {
  await mount<typeof CommittedColorStory>(STORY, { initial: START, disabled: false });
  await trigger(page).click();
  await expect(hex(page)).toHaveValue(START);

  await hex(page).fill("tomato");
  await expect(committed(page)).toHaveText("tomato");
  await expect(commits(page)).toHaveText("1");

  await hex(page).fill("notacolorxx");
  await expect(hex(page)).toHaveAttribute("aria-invalid", "true");
  await expect(committed(page)).toHaveText("tomato");
  await expect(commits(page)).toHaveText("1");
});

test("deleting the hex text never clears the value; only the reset button does, and it emits the empty sentinel", async ({ mount, page }) => {
  await mount<typeof CommittedColorStory>(STORY, { initial: START, disabled: false });
  await trigger(page).click();
  await hex(page).fill("");
  await expect(committed(page)).toHaveText(START);
  await expect(commits(page)).toHaveText("0");
  await expect(hex(page)).not.toHaveAttribute("aria-invalid", "true");

  await popup(page).locator('[data-slot="color-field-reset"]').click();
  await expect(committed(page)).toHaveText("");
  await expect(commits(page)).toHaveText("1");
  await expect(popup(page)).toHaveCount(0);
});

test("a draft abandoned by dismissing the popover does not resurface on the next open", async ({ mount, page }) => {
  await mount<typeof CommittedColorStory>(STORY, { initial: START, disabled: false });
  await trigger(page).click();
  await hex(page).fill("zzz");
  await expect(hex(page)).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);

  await trigger(page).click();
  await expect(hex(page)).toHaveValue(START);
  await expect(hex(page)).not.toHaveAttribute("aria-invalid", "true");
});

test("the native picker seeds a neutral color when nothing is set, without committing it", async ({ mount, page }) => {
  await mount<typeof CommittedColorStory>(STORY, { initial: "", disabled: false });
  await trigger(page).click();
  const native = popup(page).locator('[data-slot="color-field-native-input"]');
  // A seed of pure black reads as an empty hole in a dark popup; any lit channel is a visible mid-tone.
  const seed = await native.inputValue();
  expect(seed).toHaveLength(7);
  expect(Math.max(...[1, 3, 5].map((start) => Number.parseInt(seed.slice(start, start + 2), 16)))).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(commits(page)).toHaveText("0");
});

test("a disabled field cannot open its picker", async ({ mount, page }) => {
  await mount<typeof CommittedColorStory>(STORY, { initial: START, disabled: true });
  await expect(trigger(page)).toBeDisabled();
  await expect(popup(page)).toHaveCount(0);
});
