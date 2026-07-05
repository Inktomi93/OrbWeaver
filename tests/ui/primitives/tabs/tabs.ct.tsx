// CT: the tabs seal — click and arrow keys move selection (roving tabindex + activate-on-focus
// from Base UI), panels swap with aria-selected tracking. The active marker is a 2px primary underline
// (D62 UIP-307), not a segmented pill.
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

function fixture(): ReturnType<typeof Tabs> {
  return (
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab value="two">Two</TabsTab>
        <TabsIndicator data-testid="tab-indicator" />
      </TabsList>
      <TabsPanel value="one">First panel</TabsPanel>
      <TabsPanel value="two">Second panel</TabsPanel>
    </Tabs>
  );
}

test("click activates a tab and swaps its panel", async ({ mount, page }) => {
  await mount(fixture());
  await expect(page.getByText("First panel")).toBeVisible();
  await page.getByRole("tab", { name: "Two" }).click();
  await expect(page.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Second panel")).toBeVisible();
  await expect(page.getByText("First panel")).toBeHidden();
});

test("arrow keys move and activate tabs", async ({ mount, page }) => {
  await mount(fixture());
  await page.getByRole("tab", { name: "One" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Second panel")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("First panel")).toBeVisible();
});

test("the indicator is present and tracks the active tab", async ({ mount, page }) => {
  await mount(fixture());
  const indicator = page.getByTestId("tab-indicator");
  await expect(indicator).toBeVisible();
  // Base UI drives the indicator off the runtime --active-tab-left var; it moves when selection does.
  const leftOnOne = await indicator.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--active-tab-left"),
  );
  await page.getByRole("tab", { name: "Two" }).click();
  await expect
    .poll(() =>
      indicator.evaluate((el) => getComputedStyle(el).getPropertyValue("--active-tab-left")),
    )
    .not.toBe(leftOnOne);
});

test("the indicator is a 2px primary UNDERLINE and the list is a bordered track, not a pill (D62)", async ({
  mount,
  page,
}) => {
  await mount(fixture());
  const indicator = page.getByTestId("tab-indicator");
  // A 2px (h-0.5) bar filled with the primary token — the underline, not a full-height pill.
  await expect(indicator).toHaveCSS("height", "2px");
  await expect(indicator).toHaveCSS("background-color", TOKENS["color.primary"].value);
  // The list lost its segmented-pill `--muted` fill and gained a hairline bottom-border track.
  const list = page.locator('[data-slot="tabs-list"]');
  await expect(list).not.toHaveCSS("background-color", TOKENS["color.muted"].value);
  await expect(list).toHaveCSS("border-bottom-width", "1px");
});

test("Home/End jump to the first/last tab", async ({ mount, page }) => {
  await mount(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab value="two">Two</TabsTab>
        <TabsTab value="three">Three</TabsTab>
      </TabsList>
      <TabsPanel value="one">First panel</TabsPanel>
      <TabsPanel value="two">Second panel</TabsPanel>
      <TabsPanel value="three">Third panel</TabsPanel>
    </Tabs>,
  );
  await page.getByRole("tab", { name: "Two" }).click();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
});

test("a disabled tab is skipped by arrow-key navigation and cannot be activated by click", async ({
  mount,
  page,
}) => {
  await mount(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab disabled={true} value="two">
          Two
        </TabsTab>
        <TabsTab value="three">Three</TabsTab>
      </TabsList>
      <TabsPanel value="one">First panel</TabsPanel>
      <TabsPanel value="two">Second panel</TabsPanel>
      <TabsPanel value="three">Third panel</TabsPanel>
    </Tabs>,
  );
  const disabledTab = page.getByRole("tab", { name: "Two" });
  await expect(disabledTab).toHaveAttribute("data-disabled", "");
  await expect(disabledTab).toHaveAttribute("aria-selected", "false");

  await page.getByRole("tab", { name: "One" }).click();
  // Base UI's roving focus still lands ON a disabled tab (it isn't skipped in the DOM tab order),
  // but activateOnFocus does NOT select it — a disabled tab can never become the active tab.
  await page.keyboard.press("ArrowRight");
  await expect(disabledTab).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");
});

test("orientation=vertical mirrors data-orientation onto every part", async ({ mount, page }) => {
  await mount(
    <Tabs defaultValue="one" orientation="vertical">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab value="two">Two</TabsTab>
      </TabsList>
      <TabsPanel value="one">First panel</TabsPanel>
      <TabsPanel value="two">Second panel</TabsPanel>
    </Tabs>,
  );
  await expect(page.locator('[data-slot="tabs-root"]')).toHaveAttribute(
    "data-orientation",
    "vertical",
  );
  await expect(page.locator('[data-slot="tabs-list"]')).toHaveAttribute(
    "data-orientation",
    "vertical",
  );
  await page.getByRole("tab", { name: "One" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
});
