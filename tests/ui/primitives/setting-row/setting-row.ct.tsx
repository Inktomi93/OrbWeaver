// CT: the settings-surface row seal — label wired to the caller's control via htmlFor/id, the
// info-glyph tooltip's hint reachable as an accessible name, and the disabled-with-reason note
// (ui-package-design §6.1; work-order item 20).
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { AutoSaveRow } from "./setting-row.fixtures";

test("wires the label to the caller's control — clicking the label focuses it", async ({
  mount,
  page,
}) => {
  await mount(<AutoSaveRow />);
  await page.getByText("Auto-save").click();
  await expect(page.getByRole("textbox")).toBeFocused();
});

test("the info-glyph tooltip's hint is reachable as an accessible name and shows on hover", async ({
  mount,
  page,
}) => {
  const hint = "Saves your draft automatically every 30 seconds";
  await mount(<AutoSaveRow hint={hint} />);
  const trigger = page.getByRole("button", { name: hint });
  await expect(trigger).toBeVisible();
  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeHidden();
  await trigger.hover();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveText(hint);
});

test("renders an always-visible description under the label in the muted token", async ({
  mount,
  page,
}) => {
  await mount(<AutoSaveRow description="Saves your draft every 30 seconds" />);
  const desc = page.getByText("Saves your draft every 30 seconds");
  await expect(desc).toBeVisible();
  await expect(desc).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

test("renders a disabled-with-reason note in the muted token", async ({ mount, page }) => {
  await mount(<AutoSaveRow disabledReason="Requires an active subscription" />);
  const note = page.getByText("Requires an active subscription");
  await expect(note).toBeVisible();
  await expect(note).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});
