// CT: the separator seal — real role="separator" semantics, orientation exposed to assistive tech,
// and the rule wears the theme-aware border token (never a raw color).
import { Separator } from "@orb/ui/separator";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders a horizontal rule in the border token color", async ({ mount, page }) => {
  await mount(<Separator />);
  const rule = page.getByRole("separator");
  await expect(rule).toBeVisible();
  await expect(rule).toHaveCSS("background-color", TOKENS["color.border"].value);
});

test("vertical orientation is announced to assistive tech", async ({ mount, page }) => {
  await mount(<Separator orientation="vertical" />);
  await expect(page.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
});
