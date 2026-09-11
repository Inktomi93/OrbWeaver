// CT: the collapsible seal — the trigger toggles aria-expanded and mounts/reveals the panel content
// (Base UI owns the open state + the --collapsible-panel-height measurement; we only skin it).
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";

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

// The `size` axis — DEFAULT INVERTED at #884 C2 (born side-eye 2026-08-22 P2-4). A bare trigger is a row
// of its own — the thing you press to reach a whole section — so the BASE now pins the pointer floor; the
// recurring defect was the opt-in floor arm not taken (the this-chat 411×40 collapsible). `text` is the
// renamed opt-OUT for a disclosure in running content, and it owes a `@sub-floor-ok` marker at the mount
// (gate `sub-floor-disclosure`). `--spacing-control-sm` is read LIVE off the token because it is
// pointer-conditional (44px coarse / 32px fine) and a literal here would be wrong on one of the two.
const readControlFloor = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.height = "var(--spacing-control-sm)";
    document.body.append(probe);
    const resolved = Number.parseFloat(getComputedStyle(probe).height);
    probe.remove();
    return resolved;
  });

const SIZE_FIXTURE = (
  <>
    <Collapsible>
      <CollapsibleTrigger>Its own row</CollapsibleTrigger>
      <CollapsiblePanel>Hidden details</CollapsiblePanel>
    </Collapsible>
    <Collapsible>
      <CollapsibleTrigger size="text">Running text</CollapsibleTrigger>
      <CollapsiblePanel>Hidden details</CollapsiblePanel>
    </Collapsible>
  </>
);

test("size: the DEFAULT clears the pointer's control floor and `text` (the marked opt-out) does not claim it", async ({ mount, page }) => {
  await mount(SIZE_FIXTURE);

  const floor = await readControlFloor(page);
  expect(floor, "the control-sm token must resolve, or this assertion is vacuous").toBeGreaterThan(0);

  const textBox = await page.getByRole("button", { name: "Running text" }).boundingBox();
  const defaultBox = await page.getByRole("button", { name: "Its own row" }).boundingBox();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(defaultBox?.height).toBeGreaterThanOrEqual(floor);
  // The opt-out stays text-height: the inversion must not re-box a disclosure that sits in running copy.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(textBox?.height).toBeLessThan(floor);
});

test.describe("size at a COARSE pointer", () => {
  test.use({ hasTouch: true });

  test("the default's floor is the 44px coarse arm — the token is pointer-conditional, not a constant", async ({ mount, page }) => {
    await mount(SIZE_FIXTURE);

    // Positive control that coarse emulation actually fired (a fine-pointer run makes the 44 unreachable
    // and this pin would green at 32 for the wrong reason).
    // @orb-waive ct-no-oneshot-live-read-assert(expect): pointer capability is a context-level constant for the page's whole life — nothing transitions it.
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const floor = await readControlFloor(page);
    expect(floor).toBeGreaterThanOrEqual(44);
    const defaultBox = await page.getByRole("button", { name: "Its own row" }).boundingBox();
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
    expect(defaultBox?.height).toBeGreaterThanOrEqual(floor);
  });
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
