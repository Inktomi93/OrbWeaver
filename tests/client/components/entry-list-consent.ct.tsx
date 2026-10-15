import { viewerViewSchema } from "@orb/contracts/identity";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { userSettingsView } from "@orb/testkit/node/user-settings-view.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import { EntryListRebaseStory } from "./_entry-list-stories.tsx";

test("a replaced entry snapshot invalidates obsolete consent and returns focus without removing another row", async ({ mount, page }) => {
  const settings = userSettingsView();
  const caller = principal(settings.userId);
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => settings,
    "sessions.me": () => viewerViewSchema.parse({ userId: caller.userId, handle: caller.handle, globalRole: caller.role }),
  });
  const component = await mount(<EntryListRebaseStory items={["Alpha", "Beta", "Gamma"]} />);
  await page.getByRole("button", { name: "Remove Beta", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Remove “Beta”?", exact: true })).toBeVisible();
  await component.update(<EntryListRebaseStory items={["Beta", "Gamma"]} />);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add entry", exact: true })).toBeFocused();
  await expect(page.getByText("Nothing removed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Remove Beta", exact: true }).click();
  await page.getByRole("alertdialog", { name: "Remove “Beta”?", exact: true }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Removed Beta", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Beta", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Remove Gamma", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Remove “Gamma”?", exact: true })).toBeVisible();
  await component.update(<EntryListRebaseStory items={[]} />);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add entry", exact: true })).toBeFocused();
  await expect(page.getByText("Removed Beta", { exact: true })).toBeVisible();
  expect(trpc.unstubbed()).toEqual([]);
});
