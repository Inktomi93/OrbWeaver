// CT: the tabs seal — click and arrow keys move selection (roving tabindex + activate-on-focus
// from Base UI), panels swap with aria-selected tracking.
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
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
