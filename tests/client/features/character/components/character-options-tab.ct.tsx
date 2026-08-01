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
