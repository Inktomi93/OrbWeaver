// @subject packages/client/src/data/suspense-reads.ts
// A suspending read checks that a QueryBoundary sits above it once the check is required (the dev bootstrap and the
// surface census require it); a read inside the boundary settles and renders its data.
import { expect, test } from "@playwright/test";
import type { ReadInsideBoundaryStory, ReadOutsideBoundaryStory } from "./_query-boundary-scope-stories.tsx";

const STORIES = "tests/client/components/_query-boundary-scope-stories";

test("a read inside a QueryBoundary loads", async ({ mount }) => {
  const component = await mount<typeof ReadInsideBoundaryStory>(`${STORIES}/ReadInsideBoundaryStory`);
  await expect(component.getByText("loaded value")).toBeVisible();
});

test("a read outside a QueryBoundary throws the boundary message", async ({ mount }) => {
  const component = await mount<typeof ReadOutsideBoundaryStory>(`${STORIES}/ReadOutsideBoundaryStory`);
  await expect(component.getByRole("alert")).toContainText("[query-boundary]");
});
