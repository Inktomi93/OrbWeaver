// SectionContextHost/Header CT (north-star §4 N4 / P4) — the definition-owned CONTEXT header CHANNEL.
// The domain-agnostic host renders whatever `header` a section's `defineContextTabs` mint supplies — in the
// context BRACKET's head band since #860 — while the shell's own band slot stays empty over a tabs pane;
// a `none` context still falls back to the neutral "Details" band label. Proves the channel is blind (no
// shell-side per-section switch) and mint-fed.

import { expect, test } from "@playwright/experimental-ct-react";
import { SectionContextHeaderChannelStory, SectionContextHeaderDefaultStory } from "../_ct-stories.tsx";

test("a section's minted `header` renders in the bracket's head band; the shell's band slot stays empty", async ({ mount }) => {
  const component = await mount(<SectionContextHeaderChannelStory />);
  await expect(component.getByTestId("body-slot").locator('[data-slot="context-bracket-band"]').getByText("Fake identity")).toBeVisible();
  await expect(component.getByTestId("band-slot")).toBeEmpty();
});

test("a `none` context falls back to the neutral Details band label", async ({ mount }) => {
  const component = await mount(<SectionContextHeaderDefaultStory />);
  await expect(component.getByText("Details")).toBeVisible();
});
