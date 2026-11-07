// The chip paints its member's word, never the key, and one status set reads as one weight: a colour fills, neutral tints.
import { expect, test } from "@playwright/test";
import type { StatusChipStory } from "./_status-chip-stories.tsx";

test("a member shows its vocabulary's word and tone, not its wire key", async ({ mount }) => {
  const component = await mount<typeof StatusChipStory>("tests/client/components/_status-chip-stories/StatusChipStory");
  const sharing = component.getByText("Sharing", { exact: true });
  const idle = component.getByText("Not sharing", { exact: true });
  await expect(sharing).toHaveAttribute("data-tone", "success");
  await expect(sharing).toHaveAttribute("data-variant", "solid");
  await expect(idle).toHaveAttribute("data-tone", "neutral");
  await expect(idle).toHaveAttribute("data-variant", "soft");
  await expect(component.getByText("up", { exact: true })).toHaveCount(0);
});
