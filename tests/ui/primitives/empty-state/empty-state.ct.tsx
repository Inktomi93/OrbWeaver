// CT: the empty-state seal — renders the icon/title/description/action teaching stack from
// caller-owned copy (ui-package-design §6.1).

import { EmptyState } from "@orb/ui/empty-state";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders title, description, and action from the caller", async ({ mount, page }) => {
  const component = await mount(
    <EmptyState
      action={<button type="button">New character</button>}
      description="Weave your first one to begin."
      title="No characters yet"
    />,
  );
  await expect(page.getByText("No characters yet")).toBeVisible();
  await expect(page.getByText("Weave your first one to begin.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New character" })).toBeVisible();
  await expect(component.locator('[data-slot="empty-state-title"]')).toHaveCSS(
    "color",
    TOKENS["color.foreground"].value,
  );
  await expect(component.locator('[data-slot="empty-state-description"]')).toHaveCSS(
    "color",
    TOKENS["color.muted-foreground"].value,
  );
});

test("omits the description and action slots when not provided", async ({ mount, page }) => {
  await mount(<EmptyState title="Nothing here" />);
  await expect(page.getByText("Nothing here")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("renders the icon slot when provided", async ({ mount, page }) => {
  await mount(<EmptyState icon={<span data-testid="glyph">*</span>} title="Empty" />);
  await expect(page.getByTestId("glyph")).toBeVisible();
});
