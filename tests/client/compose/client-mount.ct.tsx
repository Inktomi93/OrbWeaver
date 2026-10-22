import { expect, test } from "@playwright/test";
import type { RegistryDoorStory, RuntimeLifetimeStory, RuntimeTeardownStory } from "./_mount-stories.tsx";

test("a provider rerender retains its data runtime and warmed cache", async ({ mount, page }) => {
  await mount<typeof RuntimeLifetimeStory>("tests/client/compose/_mount-stories/RuntimeLifetimeStory", {});
  await expect(page.getByText("Same data runtime", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rerender providers 0", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rerender providers 1", exact: true })).toBeVisible();
  await expect(page.getByText("Same data runtime", { exact: true })).toBeVisible();
  await expect(page.getByText("Retained cache", { exact: true })).toBeVisible();
});

test("unmount releases the warmed cache held by the retired data owner", async ({ mount, page }) => {
  await mount<typeof RuntimeTeardownStory>("tests/client/compose/_mount-stories/RuntimeTeardownStory", {});
  await page.getByRole("button", { name: "Warm active cache", exact: true }).click();
  await expect(page.getByText("Warmed active cache", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unmount data owner", exact: true }).click();
  await expect(page.getByText("Retired cache released", { exact: true })).toBeVisible();
});

test("the real registry door supplies the authenticated command, palette and message-tool providers", async ({ mount, page }) => {
  await mount<typeof RegistryDoorStory>("tests/client/compose/_mount-stories/RegistryDoorStory", {});
  await expect(page.getByText("Chats", { exact: true })).toBeVisible();
  await expect(page.getByText("Command door mounted", { exact: true })).toBeVisible();
  await expect(page.getByText("Palette door mounted", { exact: true })).toBeVisible();
  await expect(page.getByText("Message tools door mounted", { exact: true })).toBeVisible();
});
