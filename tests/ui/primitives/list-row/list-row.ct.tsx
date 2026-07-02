// CT: the list-row seal — the slot-based entity row (leading/title/subtitle/actions). The
// load-bearing assertion is the a11y contract: a clickable row is ONE role="button" element and
// its trailing actions are SEPARATE tab stops OUTSIDE that element, never nested inside it
// (ui-package-design §12 Wave-3-C; the work-order's binding constraint).

import { ListRow } from "@orb/ui/list-row";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("clickable row exposes button role and activates via Enter/Space", async ({ mount, page }) => {
  const clicks: string[] = [];
  await mount(
    <ListRow
      clickable={true}
      onClick={(): void => {
        clicks.push("hit");
      }}
      title="Elara"
    />,
  );
  const row = page.getByRole("button", { name: "Elara" });
  await expect(row).toHaveAttribute("tabindex", "0");
  await row.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  await expect.poll(() => clicks.length).toBe(2);
});

test("non-clickable row has no button role", async ({ mount, page }) => {
  await mount(<ListRow title="Elara" />);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("trailing action is a separate tab stop, not nested in the row's accessible name", async ({
  mount,
  page,
}) => {
  const rowClicks: string[] = [];
  const actionClicks: string[] = [];
  await mount(
    <ListRow
      actions={
        <button
          onClick={(): void => {
            actionClicks.push("hit");
          }}
          type="button"
        >
          Edit
        </button>
      }
      clickable={true}
      onClick={(): void => {
        rowClicks.push("hit");
      }}
      title="Elara"
    />,
  );
  const row = page.getByRole("button", { name: "Elara" });
  const action = page.getByRole("button", { name: "Edit" });

  // The row's accessible name excludes the action (proves the action is not nested inside it).
  await expect(row).toHaveAccessibleName("Elara");

  // Tab order proves the action is a SIBLING tab stop, not content inside the row button.
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(action).toBeFocused();

  // Clicking the action does not also fire the row's onClick (they're disjoint elements).
  await action.click();
  expect(actionClicks.length).toBe(1);
  expect(rowClicks.length).toBe(0);
});

test("selected applies the accent token surface + aria-current", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} selected={true} title="Elara" />);
  const row = page.getByRole("button", { name: "Elara" });
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(row).toHaveCSS("background-color", TOKENS["color.accent"].value);
});

test("disabled removes the row from tab order and marks aria-disabled", async ({ mount, page }) => {
  const clicks: string[] = [];
  await mount(
    <ListRow
      clickable={true}
      disabled={true}
      onClick={(): void => {
        clicks.push("hit");
      }}
      title="Elara"
    />,
  );
  const row = page.getByRole("button", { name: "Elara" });
  await expect(row).toHaveAttribute("tabindex", "-1");
  await expect(row).toHaveAttribute("aria-disabled", "true");
  // Programmatic focus still works with tabindex=-1; Enter should be a no-op — disabled drops the
  // onClick handler entirely rather than relying on a pointer-events CSS trick to swallow clicks.
  await row.focus();
  await page.keyboard.press("Enter");
  expect(clicks.length).toBe(0);
});

test("title and subtitle truncate with the full text recoverable via the title attribute", async ({
  mount,
  page,
}) => {
  const longTitle = "A".repeat(200);
  const longSubtitle = "B".repeat(200);
  await mount(<ListRow subtitle={longSubtitle} title={longTitle} />);
  await expect(page.getByText(longTitle)).toHaveAttribute("title", longTitle);
  await expect(page.getByText(longSubtitle)).toHaveAttribute("title", longSubtitle);
});

test("compact density is shorter than the default density", async ({ mount, page }) => {
  const compact = await mount(<ListRow density="compact" title="Elara" />);
  const compactHeight = await page
    .locator('[data-slot="list-row-body"]')
    .evaluate((el) => el.getBoundingClientRect().height);
  await compact.unmount();
  const defaultRow = await mount(<ListRow title="Elara" />);
  const defaultHeight = await page
    .locator('[data-slot="list-row-body"]')
    .evaluate((el) => el.getBoundingClientRect().height);
  await defaultRow.unmount();
  expect(compactHeight).toBeLessThan(defaultHeight);
});

test("renders the leading slot", async ({ mount, page }) => {
  await mount(<ListRow leading={<span data-testid="glyph">*</span>} title="Elara" />);
  await expect(page.getByTestId("glyph")).toBeVisible();
});
