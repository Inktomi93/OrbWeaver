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

test("keepMounted keeps the closed panel in the DOM", async ({ mount, page }) => {
  await mount(
    <Collapsible>
      <CollapsibleTrigger>Advanced</CollapsibleTrigger>
      <CollapsiblePanel keepMounted={true}>Persisted details</CollapsiblePanel>
    </Collapsible>,
  );

  await expect(page.getByRole("button", { name: "Advanced" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  const panel = page.getByText("Persisted details");
  await expect(panel).toBeAttached();
  await expect(panel).toBeHidden();
});

test("without keepMounted the closed panel is removed from the DOM", async ({ mount, page }) => {
  await mount(
    <Collapsible>
      <CollapsibleTrigger>Advanced</CollapsibleTrigger>
      <CollapsiblePanel>Ephemeral details</CollapsiblePanel>
    </Collapsible>,
  );

  await expect(page.getByText("Ephemeral details")).toHaveCount(0);
});

test("hiddenUntilFound renders the closed panel with hidden='until-found'", async ({
  mount,
  page,
}) => {
  await mount(
    <Collapsible>
      <CollapsibleTrigger>Advanced</CollapsibleTrigger>
      <CollapsiblePanel hiddenUntilFound={true}>Findable details</CollapsiblePanel>
    </Collapsible>,
  );

  // hidden="until-found" keeps the content in the DOM so the browser's find-in-page can reveal it.
  const panel = page.locator('[data-slot="collapsible-panel"]');
  await expect(panel).toBeAttached();
  await expect(panel).toHaveAttribute("hidden", "until-found");
});
