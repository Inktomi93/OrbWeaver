// CT: the autocomplete seal — a combobox input filters the portaled popup list; keyboard nav
// highlights an item and Enter selects it (writing it into the input). Typing is driven with
// pressSequentially (real keystrokes) so Base UI's open-on-type fires; gates use role locators.
import { Autocomplete } from "@orb/ui/autocomplete";
import { expect, test } from "@playwright/experimental-ct-react";
import { DerivedItemsStory } from "./autocomplete.fixtures";

const TAGS = ["adventure", "mystery", "romance"];

const GROUPS = [
  { label: "Genres", items: ["adventure", "mystery"] },
  { label: "Moods", items: ["happy", "tense"] },
];

test("typing filters the popup list", async ({ mount, page }) => {
  await mount(<Autocomplete aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("mys");
  await expect(page.getByRole("option", { name: "mystery" })).toBeVisible();
  await expect(page.getByRole("option", { name: "adventure" })).toHaveCount(0);
});

test("popup wears the popover token and the overlay z-index", async ({ mount, page }) => {
  await mount(<Autocomplete aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("r");
  const list = page.getByRole("listbox");
  await expect(page.getByRole("option", { name: "romance" })).toBeVisible();
  const background = await list.evaluate(
    (el) => getComputedStyle(el.parentElement ?? el).backgroundColor,
  );
  expect(background).toContain("oklch(0.235 0.013 65)");
  const zIndex = await list.evaluate((el) => getComputedStyle(el.parentElement ?? el).zIndex);
  expect(zIndex).toBe("40");
});

test("filters correctly when the parent re-renders and passes a freshly-DERIVED items array (the real consumer shape)", async ({
  mount,
  page,
}) => {
  const cmp = await mount(<DerivedItemsStory />);
  // Force parent re-renders — `items` is a NEW filtered/mapped array reference each render, the
  // normal React case A's doc claims Base UI's filter drops. If that were true, the popup would be
  // empty after a re-render.
  const rerender = cmp.getByTestId("rerender");
  await rerender.click();
  await rerender.click();
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("mys");
  await expect(page.getByRole("option", { name: "mystery" })).toBeVisible();
  await expect(page.getByRole("option", { name: "adventure" })).toHaveCount(0);
});

test("keyboard: arrow highlights an item, Enter selects it into the input", async ({
  mount,
  page,
}) => {
  await mount(<Autocomplete aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("adv");
  // Gate on the popup taking ownership before keyboard nav — focus/highlight lands async, so an
  // immediate ArrowDown/Enter would route to the input, not the list (the Wave-1 Select race).
  await expect(page.getByRole("option", { name: "adventure" })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("adventure");
});

test("the Status live region announces the filtered result count", async ({ mount, page }) => {
  await mount(<Autocomplete aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("mys");
  await expect(page.getByRole("option", { name: "mystery" })).toBeVisible();
  // Base UI Status renders a polite role="status" region; the seal feeds it the live count. (The
  // Empty part also carries role="status", so target the seal's Status by its data-slot.)
  const status = page.locator('[data-slot="autocomplete-status"]');
  await expect(status).toHaveRole("status");
  await expect(status).toHaveText("1 result");
});

test("the native Clear button empties the input", async ({ mount, page }) => {
  await mount(<Autocomplete aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("adv");
  await expect(input).toHaveValue("adv");
  // Clear is Base UI's native button (unmounted while empty, shown once there's a value) — not a
  // hand-rolled control. Base UI marks it aria-hidden by default (decorative; the input stays
  // clearable via keyboard), so it's addressed by data-slot rather than role. Clicking empties it.
  const clear = page.locator('[data-slot="autocomplete-clear"]');
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(input).toHaveValue("");
});

test("a grouped items set renders GroupLabel category headers", async ({ mount, page }) => {
  await mount(<Autocomplete aria-label="Tag" groups={GROUPS} />);
  const input = page.getByRole("combobox");
  await input.click();
  // "a" matches adventure (Genres) and happy (Moods), so both category headers should render.
  await input.pressSequentially("a");
  await expect(page.getByRole("option", { name: "adventure" })).toBeVisible();
  await expect(page.getByRole("option", { name: "happy" })).toBeVisible();
  await expect(page.getByText("Genres")).toBeVisible();
  await expect(page.getByText("Moods")).toBeVisible();
});
