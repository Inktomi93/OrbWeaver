// CT: the select seal — explicit Positioner/Popup anatomy portals a real popup (popover token,
// overlay z), pointer + keyboard select, controlled value surfaces in the trigger.
import { Field } from "@orb/ui/field";
import { Select } from "@orb/ui/select";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { RenderValueStory } from "./select.fixtures";

const NON_EMPTY = /.+/u;

const ITEMS = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
  { label: "Gamma", value: "gamma" },
];

test("aria-label names the combobox trigger", async ({ mount, page }) => {
  // Root renders no element; a labelless Select must be nameable via the trigger.
  await mount(<Select aria-label="Model picker" items={ITEMS} placeholder="Pick one" />);
  await expect(page.getByRole("combobox", { name: "Model picker" })).toBeVisible();
});

test("opens on click, selects an option, and closes", async ({ mount, page }) => {
  await mount(<Select items={ITEMS} placeholder="Pick one" />);
  const trigger = page.getByRole("combobox");
  await expect(trigger).toContainText("Pick one");
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: "Beta" }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toContainText("Beta");
});

test("popup wears the popover token and the popover z-index", async ({ mount, page }) => {
  await mount(<Select items={ITEMS} placeholder="Pick one" />);
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const popup = page.locator('[data-slot="select-popup"]');
  await expect(popup).toHaveCSS("background-color", TOKENS["color.popover"].value);
  await expect(popup).toHaveCSS("z-index", TOKENS["z.popover"].value);
});

test("keyboard: opens with ArrowDown, arrows to an option, Enter selects", async ({
  mount,
  page,
}) => {
  await mount(<Select defaultValue="alpha" items={ITEMS} />);
  const trigger = page.getByRole("combobox");
  await trigger.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  // Wait for the popup to take keyboard ownership — focus (not just highlight) must land on the
  // selected item before arrow keys route to the list instead of the trigger.
  await expect(page.getByRole("option", { name: "Alpha" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Beta" })).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toContainText("Beta");
});

test("multiple: accumulates values and keeps the popup open", async ({ mount, page }) => {
  await mount(<Select items={ITEMS} multiple={true} placeholder="Pick some" />);
  const trigger = page.getByRole("combobox");
  await trigger.click();
  await page.getByRole("option", { name: "Alpha" }).click();
  // Multiple mode does not close on select — the list stays open to accumulate.
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: "Gamma" }).click();
  await expect(page.getByRole("option", { name: "Alpha" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("option", { name: "Gamma" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("option", { name: "Beta" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  // Value comma-joins the selected labels.
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toContainText("Alpha");
  await expect(trigger).toContainText("Gamma");
});

test("multiple: reports the selected values as an array through onValueChange", async ({
  mount,
  page,
}) => {
  const seen: string[][] = [];
  await mount(
    <Select
      items={ITEMS}
      multiple={true}
      onValueChange={(value): void => {
        seen.push(value);
      }}
      placeholder="Pick some"
    />,
  );
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Alpha" }).click();
  await page.getByRole("option", { name: "Beta" }).click();
  await expect.poll(() => seen.at(-1)).toEqual(["alpha", "beta"]);
});

const GROUPED = [
  {
    label: "Warm",
    items: [
      { label: "Ember", value: "ember" },
      { label: "Amber", value: "amber" },
    ],
  },
  {
    label: "Cool",
    items: [{ label: "Slate", value: "slate" }],
  },
];

test("grouped: renders group labels and selects a grouped option", async ({ mount, page }) => {
  await mount(<Select items={GROUPED} placeholder="Pick a shade" />);
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("group").filter({ hasText: "Warm" })).toBeVisible();
  await expect(page.getByRole("group").filter({ hasText: "Cool" })).toBeVisible();
  await page.getByRole("option", { name: "Slate" }).click();
  await expect(page.getByRole("combobox")).toContainText("Slate");
});

test("grouped: renders a Separator between adjacent groups (not before the first)", async ({
  mount,
  page,
}) => {
  await mount(<Select items={GROUPED} placeholder="Pick a shade" />);
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  // Two groups → exactly one between-group Separator (Base UI Select.Separator).
  await expect(page.locator('[data-slot="select-separator"]')).toHaveCount(1);
});

test("backdrop: the opt-in scrim renders behind the popup", async ({ mount, page }) => {
  await mount(<Select backdrop={true} items={ITEMS} placeholder="Pick one" />);
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const backdrop = page.locator('[data-slot="select-backdrop"]');
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS("background-color", TOKENS["color.scrim"].value);
});

const LONG = Array.from({ length: 40 }, (_unused, i) => ({
  label: `Option ${i + 1}`,
  value: `opt-${i + 1}`,
}));

test("disabled: the trigger is inert and cannot be opened", async ({ mount, page }) => {
  await mount(<Select disabled={true} items={ITEMS} placeholder="Pick one" />);
  const trigger = page.getByRole("combobox");
  await expect(trigger).toBeDisabled();
  await expect(trigger).toHaveAttribute("data-disabled", "");
});

test("inside a <Field>, the label associates with the trigger and aria-describedby is wired", async ({
  mount,
  page,
}) => {
  await mount(
    <Field description="Used for new chats" label="Model">
      <Select items={ITEMS} placeholder="Pick one" />
    </Field>,
  );
  // getByLabel resolves only if the Field's label associates with the trigger's combobox role — the
  // R7 shape (Select.Trigger extends FieldRootState and auto-registers under Field.Root).
  const trigger = page.getByLabel("Model");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("label: Select.Label renders and names the trigger without a wrapping <Field>", async ({
  mount,
  page,
}) => {
  await mount(<Select items={ITEMS} label="Country" placeholder="Pick one" />);
  await expect(page.locator('[data-slot="select-label"]')).toHaveText("Country");
  await expect(page.getByRole("combobox", { name: "Country" })).toBeVisible();
});

test("renderValue: formats the trigger's selected-value text", async ({ mount, page }) => {
  await mount(<RenderValueStory />);
  await expect(page.getByRole("combobox")).toContainText("Selected: beta");
});

test("arrow: renders inside the popup when enabled", async ({ mount, page }) => {
  await mount(<Select arrow={true} items={ITEMS} placeholder="Pick one" />);
  await page.getByRole("combobox").click();
  await expect(page.locator('[data-slot="select-arrow"]')).toBeVisible();
});

test("side: overrides the Positioner's requested placement", async ({ mount, page }) => {
  // Generous room above and below so the requested side isn't flipped by a collision.
  await mount(
    <div style={{ paddingBottom: 300, paddingTop: 300 }}>
      <Select items={ITEMS} placeholder="Pick one" side="top" />
    </div>,
  );
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.locator('[data-slot="select-positioner"]')).toHaveAttribute("data-side", "top");
});

test("scrollArrows: the down arrow mounts on an overflowing list", async ({ mount, page }) => {
  // A spacer keeps the trigger away from the viewport edge so Base UI stays in align-item mode
  // (the mode the scroll arrows drive off); at the edge it falls back to a plain dropdown.
  await mount(
    <div style={{ paddingTop: 240 }}>
      <Select items={LONG} placeholder="Pick one" scrollArrows={true} />
    </div>,
  );
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  // The popup overflows 40 items → the hover-to-scroll down arrow is mounted (mouse input).
  await expect(page.locator('[data-slot="select-scroll-down-arrow"]')).toBeVisible();
});
