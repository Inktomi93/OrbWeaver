import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { LabelsEditorErrorStory } from "../_ct-stories.tsx";

test("a failed editor read keeps Back and Retry, and Retry refetches the failed query", async ({ mount, page }) => {
  const requests = await routeTrpc(page, {
    "tag.listTagsWithUsage": () => trpcError({ message: "unavailable" }),
    "tag.listPendingSuggestions": [],
  });
  const editor = await mount(<LabelsEditorErrorStory />);
  await expect(editor.getByRole("status")).toHaveText("Couldn't load this label.");
  const back = editor.getByRole("button", { name: "Back to Labels", exact: true });
  await expect(back).toHaveCount(1);
  await expect(back).toBeEnabled();
  const before = requests.count("tag.listTagsWithUsage");
  await editor.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => requests.count("tag.listTagsWithUsage")).toBeGreaterThan(before);
  await expect(editor.getByRole("status")).toHaveText("Couldn't load this label.");
  await back.click();
  await expect(editor.getByRole("heading", { name: "Labels", exact: true })).toBeVisible();
});
