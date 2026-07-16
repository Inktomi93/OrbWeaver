// CT: the selection-bar bulk-action chrome — the live-announcing count, Escape/clear firing
// onClear, and the caller-owned actions slot (ui-package-design §12 Wave 3-C; work-order #21).

import { SelectionBar } from "@orb/ui/selection-bar";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("placement variants ride the token surface (sticky vs floating)", async ({ mount }) => {
  const sticky = await mount(<SelectionBar count={1} onClear={(): void => undefined} />);
  await expect(sticky).toHaveCSS("background-color", TOKENS["color.background"].value);
  await sticky.unmount();

  const floating = await mount(<SelectionBar count={1} onClear={(): void => undefined} placement="floating" />);
  await expect(floating).toHaveCSS("background-color", TOKENS["color.popover"].value);
});

test("the count region is aria-live polite", async ({ mount }) => {
  const bar = await mount(
    <SelectionBar count={3} onClear={(): void => undefined}>
      <button type="button">Archive</button>
    </SelectionBar>,
  );
  await expect(bar.getByText("3 selected")).toHaveAttribute("aria-live", "polite");
});

test("the clear button fires onClear", async ({ mount, page }) => {
  let cleared = false;
  await mount(
    <SelectionBar
      count={2}
      onClear={(): void => {
        cleared = true;
      }}
    />,
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  expect(cleared).toBe(true);
});

test("Escape fires onClear when focus is within the bar", async ({ mount, page }) => {
  let cleared = false;
  await mount(
    <SelectionBar
      count={2}
      onClear={(): void => {
        cleared = true;
      }}
    >
      <button type="button">Archive</button>
    </SelectionBar>,
  );
  await page.getByRole("button", { name: "Archive" }).focus();
  await page.keyboard.press("Escape");
  expect(cleared).toBe(true);
});

test("Escape does nothing when focus is outside the bar", async ({ mount, page }) => {
  let cleared = false;
  await mount(
    <div>
      <input data-testid="outside" />
      <SelectionBar
        count={2}
        onClear={(): void => {
          cleared = true;
        }}
      />
    </div>,
  );
  await page.getByTestId("outside").focus();
  await page.keyboard.press("Escape");
  expect(cleared).toBe(false);
});

test("the actions slot renders the caller's children", async ({ mount, page }) => {
  await mount(
    <SelectionBar count={1} onClear={(): void => undefined}>
      <button type="button">Archive</button>
      <button type="button">Delete</button>
    </SelectionBar>,
  );
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
});
