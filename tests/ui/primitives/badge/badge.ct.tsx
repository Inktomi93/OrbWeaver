// CT: the badge/chip/pill seal — intent maps to the status token PAIR (computed color), sizes
// carry real padding (ui-package-design §6.1).

import { Badge } from "@orb/ui/badge";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color";

test("default intent is the neutral (muted) token background", async ({ mount }) => {
  const badge = await mount(<Badge>Draft</Badge>);
  await expect(badge).toHaveCSS("background-color", TOKENS["color.muted"].value);
});

test("success intent lands as the success token background", async ({ mount }) => {
  const badge = await mount(<Badge intent="success">Active</Badge>);
  await expect(badge).toHaveCSS("background-color", resolvedTokenColor("color.success"));
});

test("danger intent swaps to the destructive token", async ({ mount }) => {
  const badge = await mount(<Badge intent="danger">Failed</Badge>);
  await expect(badge).toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
});

test("info intent lands as the real info token pair (solid)", async ({ mount }) => {
  // info now rides its OWN token pair (was borrowing the accent surface): bg-info + text-info-foreground.
  const badge = await mount(<Badge intent="info">Filtered</Badge>);
  await expect(badge).toHaveCSS("background-color", resolvedTokenColor("color.info"));
  await expect(badge).toHaveCSS("color", resolvedTokenColor("color.info-foreground"));
});

test("soft tone swaps the fill for a tinted background + intent-colored text + a border", async ({ mount }) => {
  // soft = `bg-info/15` (a color-mix tint, NOT the opaque solid) + `text-info` (the intent hue as text)
  // + a hairline border. Text is the info hue itself; the border is present (solid has none).
  const soft = await mount(
    <Badge intent="info" tone="soft">
      Nominated
    </Badge>,
  );
  await expect(soft).toHaveCSS("color", resolvedTokenColor("color.info"));
  const borderWidth = await soft.evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(Number.parseFloat(borderWidth)).toBeGreaterThan(0);
  // the 15% tint is NOT the opaque solid fill — compare the two rendered backgrounds directly.
  const softBg = await soft.evaluate((el) => getComputedStyle(el).backgroundColor);
  await soft.unmount();
  const solid = await mount(<Badge intent="info">Filtered</Badge>);
  const solidBg = await solid.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(softBg).not.toBe(solidBg);
});

test("ghost tone drops the fill entirely, keeping the hairline outline + muted text", async ({ mount }) => {
  // The quietest tone: no background at ALL (soft still paints a 15% tint), so a dozen of them can rest
  // on a surface without competing with its one filled focal element. The fill is asserted as the
  // computed ALPHA (§4.2 clause 5 bans a color literal in a CT — and a token can't spell "no color").
  const ghost = await mount(
    <Badge intent="neutral" tone="ghost">
      noir
    </Badge>,
  );
  const alpha = await ghost.evaluate((el) => Number.parseFloat(getComputedStyle(el).backgroundColor.split(",")[3] ?? "1"));
  expect(alpha).toBe(0);
  await expect(ghost).toHaveCSS("color", resolvedTokenColor("color.muted-foreground"));
  const borderWidth = await ghost.evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(Number.parseFloat(borderWidth)).toBeGreaterThan(0);
});

test("md size carries more horizontal padding than sm", async ({ mount }) => {
  const small = await mount(<Badge size="sm">Tag</Badge>);
  const smallPad = await small.evaluate((el) => getComputedStyle(el).paddingLeft);
  await small.unmount();
  const medium = await mount(<Badge size="md">Tag</Badge>);
  const mediumPad = await medium.evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(Number.parseFloat(mediumPad)).toBeGreaterThan(Number.parseFloat(smallPad));
});
