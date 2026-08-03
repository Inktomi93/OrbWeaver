// CT: the CONTEXT Options tab's DENSITY contract (stickler visual audit F9). The tab re-homes the theme
// cluster into the instrument-tier context panel, and it — not the appearance tab — owns the field
// orientation there. Vertical label-over-swatch turned eleven colour rows into a ~54px-per-row ladder that
// exhausted the viewport before Trust/Background/History were reachable; horizontal rows are ~32px, so the
// guard is: every theme row renders label-LEFT/control-RIGHT at the real panel width. Asserted on the
// RENDERED box, not the class list — a token/breakpoint change that silently restacks the rows must be red.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CharacterOptionsTabStory } from "../_ct-stories";
import { makeCharacterDetail } from "../fixtures";

function route(page: Page): Promise<unknown> {
  const card = makeCharacterDetail({ themeOverride: null });
  return routeTrpc(page, {
    "character.get": () => card,
    "character.update": () => card,
    "character.listSnapshots": () => [],
  });
}

test("F9 the theme rows are label-left/control-right in the context panel — not a swatch ladder", async ({ mount, page }) => {
  await route(page);
  await mount(<CharacterOptionsTabStory />);

  const accentLabel = page.getByText("Accent", { exact: true });
  await expect(accentLabel).toBeVisible();
  const swatch = page.getByLabel("Accent");

  const labelBox = await accentLabel.boundingBox();
  const swatchBox = await swatch.boundingBox();
  if (labelBox === null || swatchBox === null) {
    throw new Error("theme row label/swatch did not render a box");
  }
  // Side by side (the swatch starts right of the label's right edge), not stacked.
  expect(swatchBox.x).toBeGreaterThan(labelBox.x + labelBox.width);
  // …and on the same line: the two boxes overlap vertically.
  expect(swatchBox.y).toBeLessThan(labelBox.y + labelBox.height);
});

// The theme cluster's header row carries THREE actions (the two theme doors + Reset). At the real panel
// width they do not fit beside the "Theme" label — the row wraps them onto their own line. Caught live
// during the TD build: before the wrap, "Reset to global" rendered as "Reset to glob", clipped by the panel
// edge. Asserted on the rendered box (the label list is not the defect; the geometry is).
test("no theme-cluster action clips the context panel's width", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.get": () => makeCharacterDetail({ themeOverride: { accent: "#c98a5b" } }),
    "character.update": () => makeCharacterDetail({ themeOverride: { accent: "#c98a5b" } }),
    "character.listSnapshots": () => [],
    "settings.listThemes": () => [{ id: "theme_1", name: "Hearth", override: {}, css: null, isSeed: true, createdAt: 0, updatedAt: 0 }],
  });
  const component = await mount(<CharacterOptionsTabStory />);

  const panel = await component.boundingBox();
  if (panel === null) {
    throw new Error("the options tab did not render a box");
  }
  const actions = ["Save as theme…", "Reset all to Inherit"];
  const boxes = await Promise.all(actions.map((action) => page.getByRole("button", { name: action }).boundingBox()));
  for (const [i, box] of boxes.entries()) {
    if (box === null) {
      throw new Error(`${actions[i]} did not render a box`);
    }
    expect(box.x + box.width, `${actions[i]} fits inside the panel`).toBeLessThanOrEqual(panel.x + panel.width);
  }
});
