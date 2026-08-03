// CT: the autocomplete seal — a combobox input filters the portaled popup list; keyboard nav
// highlights an item and Enter selects it (writing it into the input). Typing is driven with
// pressSequentially (real keystrokes) so Base UI's open-on-type fires; gates use role locators.
import { Autocomplete } from "@orb/ui/autocomplete";
import { Field } from "@orb/ui/field";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { ControlledOpenStory, CustomFilterStory, DerivedItemsStory, InlineStory } from "./autocomplete.fixtures.tsx";

const NON_EMPTY = /.+/u;

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

test("a custom filter override reaches Root (the async/fuzzy seam)", async ({ mount, page }) => {
  // CustomFilterStory passes filter={() => true} (matches everything). The default substring filter
  // would hide non-matching items; if the override reaches Root, a no-match query still lists both.
  // (The filter lives in the browser-bundled fixture — it must return synchronously, which a Node
  // test closure proxied across the CT boundary cannot.)
  await mount(<CustomFilterStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("zzz");
  await expect(page.getByRole("option", { name: "adventure" })).toBeVisible();
  await expect(page.getByRole("option", { name: "mystery" })).toBeVisible();
});

test("popup wears the popover token and the popover z-index", async ({ mount, page }) => {
  await mount(<Autocomplete aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("r");
  await expect(page.getByRole("option", { name: "romance" })).toBeVisible();
  const popup = page.locator('[data-slot="autocomplete-popup"]');
  await expect(popup).toHaveCSS("background-color", TOKENS["color.popover"].value);
  await expect(popup).toHaveCSS("z-index", TOKENS["z.popover"].value);
});

test("disabled: the input is inert", async ({ mount, page }) => {
  await mount(<Autocomplete aria-label="Tag" disabled={true} items={TAGS} />);
  const input = page.getByRole("combobox");
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute("data-disabled", "");
});

test("inside a <Field>, the label associates with the input and aria-describedby is wired", async ({ mount, page }) => {
  await mount(
    <Field description="Press Enter to add" label="Tag">
      <Autocomplete items={TAGS} />
    </Field>,
  );
  // getByLabel resolves only if Field's label associates with the input — the R7 shape
  // (Autocomplete.Input is the field-aware Combobox.Input, auto-registering under Field.Root).
  const input = page.getByLabel("Tag");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("arrow: renders inside the popup when enabled", async ({ mount, page }) => {
  await mount(<Autocomplete arrow={true} aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("r");
  await expect(page.locator('[data-slot="autocomplete-arrow"]')).toBeVisible();
});

test("side: overrides the Positioner's requested placement", async ({ mount, page }) => {
  await mount(
    <div style={{ paddingBottom: 300, paddingTop: 300 }}>
      <Autocomplete aria-label="Tag" items={TAGS} side="top" />
    </div>,
  );
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("r");
  await expect(page.getByRole("option", { name: "romance" })).toBeVisible();
  await expect(page.locator('[data-slot="autocomplete-positioner"]')).toHaveAttribute("data-side", "top");
});

test("filters correctly when the parent re-renders and passes a freshly-DERIVED items array (the real consumer shape)", async ({ mount, page }) => {
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

test("keyboard: arrow highlights an item, Enter selects it into the input", async ({ mount, page }) => {
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

// CONTROLLED OPEN (added 2026-08-03 for the tag picker): the popup is an overlay, so a caller that knows
// its own match count must be able to decline to open one with nothing in it. Measured defect: an empty
// popup intercepted the pointer on the control directly beneath the field.
test("controlled open: a no-match query opens NO popup, and what sits below stays clickable", async ({ mount, page }) => {
  const component = await mount(<ControlledOpenStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("zzz");
  await expect(page.locator('[data-slot="autocomplete-popup"]')).toHaveCount(0);

  // No dismissal, no force: a real click on the element the popup would have covered.
  await component.getByTestId("below").click();
  await expect(component.getByTestId("below")).toHaveText("below 1");
});

test("controlled open: a matching query DOES open the popup", async ({ mount, page }) => {
  await mount(<ControlledOpenStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("myst");
  await expect(page.getByRole("option", { name: "mystery" })).toBeVisible();
});

// THE INLINE ARM (side-eye 2026-08-03 P0): a popup anchored under the field is taller than a prompt
// dialog, so it covers the confirm row it points at and Base UI `aria-hidden`s the rest of the host out
// of the accessibility tree. `inline` renders the same list in flow — same keyboard model, no overlay.
test("inline: the suggestions render IN FLOW, and what sits below stays clickable", async ({ mount, page }) => {
  const component = await mount(<InlineStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("adv");
  await expect(page.getByRole("option", { name: "adventure" })).toBeVisible();

  // NOT portalled: the list is a descendant of the story's own subtree.
  await expect(component.locator('[data-slot="autocomplete-inline-list"]')).toHaveCount(1);
  const below = page.getByTestId("below");
  await below.click();
  await expect(below).toHaveText("below 1");
});

test("inline: Enter on a highlighted item still writes it into the input", async ({ mount, page }) => {
  await mount(<InlineStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("adv");
  await expect(page.getByRole("option", { name: "adventure" })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  // Base UI fills the input from a selection only when a Popup part is mounted, which this anatomy has
  // none of — the seal wires the item's own click instead. Without it, selecting is silently inert.
  await expect(input).toHaveValue("adventure");
});

test("inline: nothing to suggest leaves NO frame behind", async ({ mount, page }) => {
  const component = await mount(<InlineStory />);
  const list = component.locator('[data-slot="autocomplete-inline-list"]');
  await expect(list).toBeHidden();
  await page.getByRole("combobox").fill("zzz");
  await expect(list).toBeHidden();
});
