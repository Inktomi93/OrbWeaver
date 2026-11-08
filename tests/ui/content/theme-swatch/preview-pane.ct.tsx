// A ThemePreviewPane is the card's edge and fill under the shell surface it stands for, in a box its shape and tier set.

import { SEED_CASES } from "@orb/testkit/iso";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { PreviewPaneStory } from "./_preview-pane-stories.tsx";

const STORY = "tests/ui/content/theme-swatch/_preview-pane-stories/PreviewPaneStory";

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

/** The probes each fill must paint: its background, its edge and its ink. */
const FILL_PAINT = {
  background: { bg: "bg-background", edge: "edge-tone", ink: "ink-card" },
  accent: { bg: "bg-accent", edge: "edge-tone", ink: "ink-accent" },
  sidebar: { bg: "bg-sidebar", edge: "edge-sidebar", ink: "ink-sidebar" },
  sidebarEdge: { bg: "bg-card", edge: "edge-sidebar", ink: "ink-card" },
  translucent: { bg: "bg-translucent", edge: "edge-tone", ink: "ink-plate" },
} as const;

for (const { name, ...props } of SEED_CASES) {
  test(`${name}: every fill paints its background, edge and ink from the surface it stands for`, async ({ mount }) => {
    const component = await mount<typeof PreviewPaneStory>(STORY, props);
    const probe = (which: string, property: string): Promise<string> => style(component.locator(`[data-probe="${which}"]`), property);
    for (const [fill, paint] of Object.entries(FILL_PAINT)) {
      const pane = component.locator(`[data-case="fill-${fill}"]`);
      await expect(pane).toHaveAttribute("data-tone", "neutral");
      expect(await style(pane, "background-color"), `${fill} background`).toBe(await probe(paint.bg, "background-color"));
      expect(await style(pane, "border-block-start-color"), `${fill} edge`).toBe(await probe(paint.edge, "border-block-start-color"));
      expect(await style(pane, "color"), `${fill} ink`).toBe(await probe(paint.ink, "color"));
    }
  });

  test(`${name}: each shape takes its radius and inset, the island from the surface's tier, and a lifted pane casts the overlay shadow`, async ({ mount }) => {
    const component = await mount<typeof PreviewPaneStory>(STORY, props);
    const probe = (which: string, property: string): Promise<string> => style(component.locator(`[data-probe="${which}"]`), property);
    const radius = "border-start-start-radius";
    const pane = (kase: string): Locator => component.locator(`[data-case="${kase}"]`);
    expect(await style(pane("fill-background"), radius), "island radius").toBe(await probe("radius-base", radius));
    expect(await style(pane("fill-background"), "padding-block-start"), "island inset").toBe(await probe("pad-block", "padding-block-start"));
    expect(await style(pane("row"), radius), "row radius").toBe(await probe("radius-control", radius));
    expect(await style(pane("row-none"), "padding-block-start"), "row with no inset").toBe("0px");
    expect(await style(pane("inset"), radius), "inset radius").toBe(await probe("radius-inset", radius));
    expect(await style(pane("lifted"), "box-shadow"), "lifted").toBe(await probe("lift", "box-shadow"));
    expect(await style(pane("inset"), "box-shadow"), "resting").not.toBe(await probe("lift", "box-shadow"));
    // Inside an instrument surface the island takes the tier's inset; a row is its own box at every tier.
    await expect(pane("tier-island")).toHaveAttribute("data-slot", "card-root");
    expect(await style(pane("tier-island"), "padding-block-start"), "tier island inset").toBe(await probe("pad-row", "padding-block-start"));
    await expect(pane("tier-row")).toHaveAttribute("data-slot", "theme-preview-pane");
    expect(await style(pane("tier-row"), radius), "tier row radius").toBe(await probe("radius-control", radius));
  });
}
