// CT: the combobox seal — chips render selected values inline with the draft input; typing
// filters the portaled popup list, Enter/comma commit free text alongside suggestions. Typing is
// driven with pressSequentially (real keystrokes) so Base UI's open-on-type fires; gates use role
// locators for the input/popup and the `combobox-chip` data-slot for committed chips.
import { Combobox } from "@orb/ui/combobox";
import { Field } from "@orb/ui/field";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { DerivedItemsStory } from "./combobox.fixtures";

const TAGS = ["adventure", "mystery", "romance"];
const CHIP_SELECTOR = '[data-slot="combobox-chip"]';
// Exact-text match: `hasText` substring-matches, and "adventure" itself contains "adv".
const EXACT_ADV = /^adv$/u;
const NON_EMPTY = /.+/u;

test("selecting a suggestion commits it as a chip and clears the draft", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("adv");
  await page.getByRole("option", { name: "adventure" }).click();
  await expect(page.locator(CHIP_SELECTOR, { hasText: "adventure" })).toBeVisible();
  await expect(input).toHaveValue("");
});

test("the labeled remove button removes a chip", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" defaultValue={["adventure", "mystery"]} items={TAGS} />);
  await expect(page.locator(CHIP_SELECTOR, { hasText: "adventure" })).toBeVisible();
  await page.getByRole("button", { name: "Remove adventure" }).click();
  await expect(page.locator(CHIP_SELECTOR, { hasText: "adventure" })).toHaveCount(0);
  await expect(page.locator(CHIP_SELECTOR, { hasText: "mystery" })).toBeVisible();
});

test("keyboard: Enter commits typed free text as a chip alongside suggestions", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("space-opera");
  await input.press("Enter");
  await expect(page.locator(CHIP_SELECTOR, { hasText: "space-opera" })).toBeVisible();
  await expect(input).toHaveValue("");
});

test("keyboard: comma commits the draft as a chip", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("noir,");
  await expect(page.locator(CHIP_SELECTOR, { hasText: "noir" })).toBeVisible();
  await expect(input).toHaveValue("");
});

test("keyboard: Backspace on an empty draft removes the last chip", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" defaultValue={["adventure", "mystery"]} items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.press("Backspace");
  await expect(page.locator(CHIP_SELECTOR, { hasText: "mystery" })).toHaveCount(0);
  await expect(page.locator(CHIP_SELECTOR, { hasText: "adventure" })).toBeVisible();
});

test("keyboard: arrow highlights a suggestion, Enter defers to native selection (not free text)", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("adv");
  await expect(page.getByRole("option", { name: "adventure" })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page.locator(CHIP_SELECTOR, { hasText: "adventure" })).toBeVisible();
  // The literal typed fragment "adv" must NOT land as its own chip.
  await expect(page.locator(CHIP_SELECTOR, { hasText: EXACT_ADV })).toHaveCount(0);
});

test("free-text entries dedup and trim on commit", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" defaultValue={["magic"]} items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("  magic  ");
  await input.press("Enter");
  await expect(page.locator(CHIP_SELECTOR, { hasText: "magic" })).toHaveCount(1);
});

test("maxItems caps free-text commits and suggestion selection", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" defaultValue={["adventure", "mystery"]} items={TAGS} maxItems={2} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("thriller");
  // At the cap, the popup offers no suggestions (not even a non-matching "thriller" option) and
  // reports the cap instead of "No results." — checked BEFORE Enter, since Enter with nothing
  // highlighted also closes the popup (Base UI's own no-selection fallback).
  await expect(page.getByText("Maximum of 2 reached.")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  await input.press("Enter");
  await expect(page.locator('[data-slot="combobox-chip"]')).toHaveCount(2);
});

test("works with NO suggestions — pure free-text chip entry, no popup", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Keywords" />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("forest, cabin");
  await input.press("Enter");
  await expect(page.locator(CHIP_SELECTOR, { hasText: "forest" })).toBeVisible();
  await expect(page.locator(CHIP_SELECTOR, { hasText: "cabin" })).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("filters correctly when the parent re-renders and passes a freshly-DERIVED items array (the real consumer shape)", async ({ mount, page }) => {
  const cmp = await mount(<DerivedItemsStory />);
  const rerender = cmp.getByTestId("rerender");
  await rerender.click();
  await rerender.click();
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("mys");
  await expect(page.getByRole("option", { name: "mystery" })).toBeVisible();
  await expect(page.getByRole("option", { name: "adventure" })).toHaveCount(0);
});

test("popup wears the popover token and the popover z-index", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("r");
  await expect(page.getByRole("option", { name: "romance" })).toBeVisible();
  const popup = page.locator('[data-slot="combobox-popup"]');
  await expect(popup).toHaveCSS("background-color", TOKENS["color.popover"].value);
  await expect(popup).toHaveCSS("z-index", TOKENS["z.popover"].value);
});

test("the Status live region announces the filtered result count", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("mys");
  await expect(page.getByRole("option", { name: "mystery" })).toBeVisible();
  const status = page.locator('[data-slot="combobox-status"]');
  await expect(status).toHaveRole("status");
  await expect(status).toHaveText("1 result");
});

test("disabled: the input is inert", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" disabled={true} items={TAGS} />);
  const input = page.getByRole("combobox");
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute("data-disabled", "");
});

test("inside a <Field>, the label associates with the input and aria-describedby is wired", async ({ mount, page }) => {
  await mount(
    <Field description="Press Enter to add" label="Tags">
      <Combobox items={TAGS} />
    </Field>,
  );
  // getByLabel resolves only if Field's label associates with the input — the R7 shape
  // (Combobox.Input extends FieldRootState, auto-registering under Field.Root).
  const input = page.getByLabel("Tags");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("arrow: renders inside the popup when enabled", async ({ mount, page }) => {
  await mount(<Combobox arrow={true} aria-label="Tag" items={TAGS} />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("r");
  await expect(page.locator('[data-slot="combobox-arrow"]')).toBeVisible();
});

test("side: overrides the Positioner's requested placement", async ({ mount, page }) => {
  await mount(
    <div style={{ paddingBottom: 300, paddingTop: 300 }}>
      <Combobox aria-label="Tag" items={TAGS} side="top" />
    </div>,
  );
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("r");
  await expect(page.getByRole("option", { name: "romance" })).toBeVisible();
  await expect(page.locator('[data-slot="combobox-positioner"]')).toHaveAttribute("data-side", "top");
});
