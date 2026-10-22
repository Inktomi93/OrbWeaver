import { createCorpusReadResponder } from "@orb/testkit/iso/corpus-read-responder.ts";
import { expect, test } from "@orb/testkit/node/ct-corpus.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { EntryListRebaseStory } from "./_entry-list-stories.tsx";

test("a replaced entry snapshot invalidates obsolete consent and returns focus without removing another row", async ({ corpus, mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
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
});
