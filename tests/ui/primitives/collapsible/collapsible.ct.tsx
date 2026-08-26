// CT: the collapsible seal — the trigger toggles aria-expanded and mounts/reveals the panel content
// (Base UI owns the open state + the --collapsible-panel-height measurement; we only skin it).
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { expect, test } from "@playwright/experimental-ct-react";

const ROTATE_ON_OPEN_RE = /group-data-\[panel-open\]:rotate-180/;

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

  await expect(page.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-expanded", "false");
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

test("hiddenUntilFound renders the closed panel with hidden='until-found'", async ({ mount, page }) => {
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

test("the trigger is keyboard-operable (Enter and Space both toggle)", async ({ mount, page }) => {
  await mount(
    <Collapsible>
      <CollapsibleTrigger>Advanced</CollapsibleTrigger>
      <CollapsiblePanel>Hidden details</CollapsiblePanel>
    </Collapsible>,
  );

  const trigger = page.getByRole("button", { name: "Advanced" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Hidden details")).toBeVisible();

  await page.keyboard.press(" ");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Hidden details")).toBeHidden();
});

test("the trigger bakes a chevron affordance by default (rotates on open via data-panel-open)", async ({ mount, page }) => {
  await mount(
    <Collapsible>
      <CollapsibleTrigger>Advanced</CollapsibleTrigger>
      <CollapsiblePanel>Hidden details</CollapsiblePanel>
    </Collapsible>,
  );
  const trigger = page.locator('[data-slot="collapsible-trigger"]');
  // The baked chevron carries the rotate-on-open class keyed off the trigger's own data-panel-open (the group).
  const chevron = trigger.locator("svg");
  await expect(chevron).toBeVisible();
  await expect(chevron).toHaveClass(ROTATE_ON_OPEN_RE);
  // Open the panel → the trigger gains data-panel-open, driving the CSS rotation.
  await trigger.click();
  await expect(trigger).toHaveAttribute("data-panel-open", "");
});

test("chevron={false} suppresses the baked chevron (a consumer renders its own)", async ({ mount, page }) => {
  await mount(
    <Collapsible>
      <CollapsibleTrigger chevron={false}>Advanced</CollapsibleTrigger>
      <CollapsiblePanel>Hidden details</CollapsiblePanel>
    </Collapsible>,
  );
  await expect(page.locator('[data-slot="collapsible-trigger"] svg')).toHaveCount(0);
});

// The `size` axis (side-eye 2026-08-22 P2-4). A disclosure that IS a row of its own — the thing you press to
// reach a whole section — has to clear the pointer floor, and the shipped trigger is text-height by design
// (right for a disclosure sitting in running content, wrong for a row). `inline` stays the default so no
// existing consumer moves; `control` pins `--spacing-control-sm`, read LIVE off the token because it is
// pointer-conditional (44px coarse / 32px fine) and a literal here would be wrong on one of the two.
test("size: `control` clears the pointer's control floor and `inline` (the default) does not claim it", async ({ mount, page }) => {
  await mount(
    <>
      <Collapsible>
        <CollapsibleTrigger>Running text</CollapsibleTrigger>
        <CollapsiblePanel>Hidden details</CollapsiblePanel>
      </Collapsible>
      <Collapsible>
        <CollapsibleTrigger size="control">Its own row</CollapsibleTrigger>
        <CollapsiblePanel>Hidden details</CollapsiblePanel>
      </Collapsible>
    </>,
  );

  const floor = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.height = "var(--spacing-control-sm)";
    document.body.append(probe);
    const resolved = Number.parseFloat(getComputedStyle(probe).height);
    probe.remove();
    return resolved;
  });
  expect(floor, "the control-sm token must resolve, or this assertion is vacuous").toBeGreaterThan(0);

  const inlineBox = await page.getByRole("button", { name: "Running text" }).boundingBox();
  const controlBox = await page.getByRole("button", { name: "Its own row" }).boundingBox();
  // ONESHOT-OK: the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(controlBox?.height).toBeGreaterThanOrEqual(floor);
  // The default is UNCHANGED — this variant may not silently re-box every disclosure already shipped.
  // ONESHOT-OK: the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(inlineBox?.height).toBeLessThan(floor);
});

test("disabled on the root disables the trigger and blocks toggling", async ({ mount, page }) => {
  await mount(
    <Collapsible disabled={true}>
      <CollapsibleTrigger>Advanced</CollapsibleTrigger>
      <CollapsiblePanel>Hidden details</CollapsiblePanel>
    </Collapsible>,
  );

  const trigger = page.getByRole("button", { name: "Advanced" });
  await expect(trigger).toHaveAttribute("data-disabled", "");
  await expect(trigger).toBeDisabled();
  await expect(page.getByText("Hidden details")).toBeHidden();
});
