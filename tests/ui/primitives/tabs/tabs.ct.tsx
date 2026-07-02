// CT: the tabs seal — click and arrow keys move selection (roving tabindex + activate-on-focus
// from Base UI), panels swap with aria-selected tracking.
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { expect, test } from "@playwright/experimental-ct-react";

function fixture(): ReturnType<typeof Tabs> {
  return (
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab value="two">Two</TabsTab>
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
