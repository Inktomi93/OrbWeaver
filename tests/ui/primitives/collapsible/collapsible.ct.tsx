// CT: the collapsible seal — the trigger toggles aria-expanded and mounts/reveals the panel content
// (Base UI owns the open state + the --collapsible-panel-height measurement; we only skin it).
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { expect, test } from "@playwright/experimental-ct-react";

test("trigger expands and collapses the panel", async ({ mount, page }) => {
  await mount(
    <Collapsible>
      <CollapsibleTrigger>Advanced</CollapsibleTrigger>
      <CollapsiblePanel>Hidden details</CollapsiblePanel>
    </Collapsible>,
  );

  const trigger = page.getByRole("button", { name: "Advanced" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Hidden details")).toBeHidden();

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Hidden details")).toBeVisible();

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Hidden details")).toBeHidden();
});
