// CT: the host-only memory detail translates the recall trace into operator-facing answers. The pins
// distinguish "recall did not run" from a zero-result run and exercise every verdict label on a real DOM.

import { expect, test } from "@playwright/experimental-ct-react";
import { MemoryRecallDetailStory } from "../_ct-stories.tsx";

test("a missing trace says recall did not run", async ({ mount }) => {
  const component = await mount(<MemoryRecallDetailStory scenario="none" />);
  await expect(component.getByText("Memory recall did not run for this assembly.")).toBeVisible();
});

test("a zero-result trace remains distinct and explains the result", async ({ mount }) => {
  const component = await mount(<MemoryRecallDetailStory scenario="empty" />);
  await expect(component.getByText("Memory recall — 0 of 0 surfaced")).toBeVisible();
  await expect(component.getByText("mode off")).toBeVisible();
  await expect(component.getByText("No memory blocks were considered.")).toBeVisible();
});

test("a populated trace renders query, counts, scores, ranks, and every verdict in plain language", async ({ mount }) => {
  const component = await mount(<MemoryRecallDetailStory scenario="detailed" />);

  await expect(component.getByText("Memory recall — 1 of 9 surfaced")).toBeVisible();
  await expect(component.getByText("9 → 6 → 1")).toBeVisible();
  await expect(component.getByText("Query (embedded)")).toBeVisible();
  await expect(component.getByText("the old observatory")).toBeVisible();
  await expect(component.getByText("one block survived reranking")).toBeVisible();
  await expect(component.getByText("#1 tier 0 · block 4")).toBeVisible();
  await expect(component.getByText("82% match")).toBeVisible();
  await expect(component.getByText("surfaced", { exact: true })).toBeVisible();
  await expect(component.getByText("below the score floor")).toBeVisible();
  await expect(component.getByText("covered by a higher tier")).toBeVisible();
  await expect(component.getByText("not eligible in this mode")).toBeVisible();
  await expect(component.getByText("still in the live history")).toBeVisible();
  await expect(component.getByText("not witnessed by this speaker")).toBeVisible();
  await expect(component.getByRole("listitem")).toHaveCount(6);
});
