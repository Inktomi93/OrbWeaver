// D336: a row's state is its attribute. The skin keys on `data-selected` and `data-disabled`, the announcement on
// `aria-current` (derived from `data-selected`), `aria-expanded` and `aria-disabled`.
import { expect, test } from "@playwright/test";
import type { StateAttributeStory } from "./_state-attribute-stories.tsx";

test("selected, expanded and disabled rows read their state from the attributes", async ({ mount }) => {
  const component = await mount<typeof StateAttributeStory>("tests/ui/primitives/list-row/_state-attribute-stories/StateAttributeStory", {});
  const row = (name: string): ReturnType<typeof component.getByRole> => component.getByRole("button", { name, exact: true });
  const paint = (name: string): Promise<{ readonly rail: string; readonly fill: string; readonly opacity: string }> =>
    row(name).evaluate((element) => {
      const style = getComputedStyle(element);
      return { rail: style.borderInlineStartColor, fill: style.backgroundColor, opacity: style.opacity };
    });

  const plain = await paint("Plain");
  const selected = await paint("Selected");
  // The selected row paints the rail and the fill the plain row leaves transparent.
  expect(selected.rail).not.toBe(plain.rail);
  expect(selected.fill).not.toBe(plain.fill);
  await expect(row("Selected")).toHaveAttribute("aria-current", "true");
  await expect(row("Plain")).not.toHaveAttribute("aria-current");

  await expect(row("Expanded")).toHaveAttribute("aria-expanded", "true");
  await expect(row("Plain")).not.toHaveAttribute("aria-expanded");
  // An open disclosure header holds the tint-active fill, on the body or, for a row-tinted row, on the root.
  const tint = await component.locator('[data-probe="tint"]').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect((await paint("Expanded")).fill).toBe(tint);
  const rootFill = (name: string): Promise<string> =>
    row(name)
      .locator("xpath=..")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await rootFill("Expanded row tint")).toBe(tint);
  expect(await rootFill("Plain row tint")).not.toBe(tint);
  expect((await paint("Expanded row tint")).fill).not.toBe(tint);

  const disabled = await paint("Disabled");
  expect(disabled.opacity).not.toBe(plain.opacity);
  await expect(row("Disabled")).toHaveAttribute("aria-disabled", "true");
  await expect(row("Disabled")).toHaveAttribute("tabindex", "-1");

  // The enabled row's handler fires on a real click, so a count of zero on the disabled row means it withheld the click, not that
  // handlers are dead. Playwright treats `aria-disabled` as not actionable, so the click is dispatched as an event.
  const clicks = component.locator('[data-slot="clicks"]');
  const disabledClicks = component.locator('[data-slot="disabled-clicks"]');
  await expect(clicks).toHaveText("0");
  await expect(disabledClicks).toHaveText("0");
  await row("Disabled").dispatchEvent("click");
  await row("Plain").click();
  await expect(clicks).toHaveText("1");
  await expect(disabledClicks).toHaveText("0");
});
