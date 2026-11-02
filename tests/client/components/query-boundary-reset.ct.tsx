// @subject packages/client/src/components/query-boundary.tsx
// A key change resets a standing error at most once: a child that throws for every key settles on the error arm for the new key,
// and a deferred change to a failing fresh key reads it once and keeps the error arm.
import { expect, test } from "@playwright/test";
import type { DeferredKeyStory, ThrowingChildStory } from "./_query-boundary-reset-stories.tsx";

const STORIES = "tests/client/components/_query-boundary-reset-stories";

test("a child that throws for every key shows the error arm for the new key, with no reset loop", async ({ mount, page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const component = await mount<typeof ThrowingChildStory>(`${STORIES}/ThrowingChildStory`, { name: "a" });
  await expect(component.getByRole("alert")).toContainText("failed a");
  await component.update({ name: "b" });
  // A reset loop never reaches this arm: React gives up with its maximum-update-depth error and unmounts the tree.
  await expect(component.getByRole("alert")).toContainText("failed b");
  expect(pageErrors.filter((message) => /Maximum update depth|#185/u.test(message))).toEqual([]);
});

test("a deferred change to a failing fresh key reads it once and keeps the error arm", async ({ mount }) => {
  const component = await mount<typeof DeferredKeyStory>(`${STORIES}/DeferredKeyStory`, { name: "a" });
  await expect(component.getByText("loaded a", { exact: true })).toBeVisible();
  await component.update({ name: "b" });
  // A second read resets the arm in the same commit as the first catch, so the arm that paints would say two reads.
  await expect(component.getByRole("alert")).toHaveText("failed b after 1 reads");
  await expect(component.getByText("loading", { exact: true })).toHaveCount(0);
});
