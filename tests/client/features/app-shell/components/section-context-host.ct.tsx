// SectionContextHeader CT (north-star §4 N4 / P4) — the definition-owned CONTEXT header CHANNEL. The
// domain-agnostic band host renders whatever `header` a section's `defineContextTabs` mint supplies, and
// falls back to the neutral "Details" label when a context supplies none. Proves the channel is blind
// (no shell-side per-section switch) and mint-fed.

import { expect, test } from "@playwright/experimental-ct-react";
import { SectionContextHeaderChannelStory, SectionContextHeaderDefaultStory } from "../_ct-stories.tsx";

test("a section's minted `header` renders in the context band (the definition-owned channel)", async ({ mount }) => {
  const component = await mount(<SectionContextHeaderChannelStory />);
  await expect(component.getByText("Fake identity")).toBeVisible();
});

test("a context with no header falls back to the neutral Details label", async ({ mount }) => {
  const component = await mount(<SectionContextHeaderDefaultStory />);
  await expect(component.getByText("Details")).toBeVisible();
});
