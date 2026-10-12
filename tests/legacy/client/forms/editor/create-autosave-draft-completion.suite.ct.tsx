import { expect, test } from "@playwright/experimental-ct-react";
import { BoundaryCompletionOwnershipStory } from "./_ct-stories.tsx";
import { UnsubmittedDraftCompletionStory } from "./_draft-completion-stories.tsx";

test("a confirmed save keeps the newer unsubmitted draft", async ({ mount, page }) => {
  await mount(<BoundaryCompletionOwnershipStory />);
  const input = page.getByLabel("Completion text");
  await input.fill("submitted snapshot");
  await page.getByRole("button", { name: "submit now", exact: true }).click();
  await expect(page.getByTestId("completion-calls")).toHaveText("1");

  await input.fill("newer unsubmitted draft");
  await expect(page.getByTestId("completion-draft")).toHaveText("newer unsubmitted draft");
  await page.getByRole("button", { name: "resolve first", exact: true }).click();

  await expect(input).toHaveValue("newer unsubmitted draft");
  await expect(page.getByTestId("completion-state")).toHaveText("saving");
  await expect(page.getByTestId("completion-draft")).toHaveText("newer unsubmitted draft");
});

test("a newer invalid draft survives save completion and reopening over the confirmed row", async ({ mount, page }) => {
  await mount(<UnsubmittedDraftCompletionStory />);
  const input = page.getByLabel("Pending text");
  await input.fill("submitted snapshot");
  await page.getByRole("button", { name: "Submit snapshot", exact: true }).click();
  await expect(page.getByTestId("draft-save-count")).toHaveText("1");
  await input.fill("x");
  await expect(page.getByTestId("draft-live-value")).toHaveText("x");
  await page.getByRole("button", { name: "Resolve save", exact: true }).click();
  await expect(page.getByTestId("draft-server-value")).toHaveText("submitted snapshot");
  await expect(page.getByTestId("draft-save-state")).toHaveText("blocked");
  await expect(page.getByTestId("draft-live-value")).toHaveText("x");
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("button", { name: "Reopen editor", exact: true }).click();
  await expect(input).toHaveValue("x");
  await expect(page.getByTestId("draft-save-count")).toHaveText("1");
});

test("an active restored draft survives a newer server echo until explicit retry", async ({ mount, page }) => {
  await mount(<UnsubmittedDraftCompletionStory restored={true} />);
  const input = page.getByLabel("Pending text");
  await expect(input).toHaveValue("restored B");
  await expect(page.getByTestId("draft-live-value")).toHaveText("restored B");
  await expect(page.getByTestId("draft-save-count")).toHaveText("0");
  await page.getByRole("button", { name: "Receive external change", exact: true }).click();
  await expect(page.getByTestId("draft-server-value")).toHaveText("external C");
  await expect(input).toHaveValue("restored B");
  await expect(page.getByTestId("draft-live-value")).toHaveText("restored B");
  await expect(page.getByTestId("draft-save-count")).toHaveText("0");
  await page.getByRole("button", { name: "Submit snapshot", exact: true }).click();
  await expect(page.getByTestId("draft-save-count")).toHaveText("1");
  await page.getByRole("button", { name: "Resolve save", exact: true }).click();
  await expect(page.getByTestId("draft-server-value")).toHaveText("restored B");
  await expect(page.getByTestId("draft-save-state")).toHaveText("saved");
  await page.getByRole("button", { name: "Receive external change", exact: true }).click();
  await expect(input).toHaveValue("external C");
});
