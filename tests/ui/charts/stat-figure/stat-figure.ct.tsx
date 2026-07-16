// CT: <StatFigure> — big-number + optional sparkline.
// Covers the bare number+delta mode (no chart mounts) and the delta's non-color glyph +
// intent-token color pairing (real DOM/CSS, fine to assert here). The sparkline's TOKENS-sourced
// line color is asserted on the pure `buildSparklineOption` builder in stat-figure.test.ts — see
// bar-list.ct.tsx's header comment for why (the RPC boundary strips the mounted instance).
import { StatFigure } from "@orb/ui/stat-figure";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders label + value with no chart when trend is omitted", async ({ mount }) => {
  const component = await mount(<StatFigure label="Documents indexed" value="1,204" />);
  await expect(component.getByText("Documents indexed")).toBeVisible();
  await expect(component.getByText("1,204")).toBeVisible();
  await expect(component.getByRole("img")).toHaveCount(0);
});

test("an up delta shows the chevron-up glyph and the success token color", async ({ mount }) => {
  const component = await mount(<StatFigure delta={{ text: "+12% this week", direction: "up" }} label="Documents indexed" value="1,204" />);
  const delta = component.locator('[data-slot="stat-figure-delta"]');
  await expect(delta).toBeVisible();
  await expect(delta.locator("svg")).toBeVisible();
  await expect(delta).toHaveCSS("color", TOKENS["color.success"].value);
});

test("a down delta shows the chevron-down glyph and the destructive token color", async ({ mount }) => {
  const component = await mount(<StatFigure delta={{ text: "-3 today", direction: "down" }} label="Documents indexed" value="1,204" />);
  const delta = component.locator('[data-slot="stat-figure-delta"]');
  await expect(delta.locator("svg")).toBeVisible();
  await expect(delta).toHaveCSS("color", TOKENS["color.destructive"].value);
});

test("a flat delta shows the dash glyph and the muted-foreground token color", async ({ mount }) => {
  const component = await mount(<StatFigure delta={{ text: "no change", direction: "flat" }} label="Documents indexed" value="1,204" />);
  const delta = component.locator('[data-slot="stat-figure-delta"]');
  await expect(delta.locator("svg")).toBeVisible();
  await expect(delta).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

test("a trend renders a sparkline chart, an omitted trend does not", async ({ mount }) => {
  const component = await mount(<StatFigure label="Documents indexed" trend={[1, 4, 2, 8, 5, 9]} value="1,204" />);
  await expect(component.getByRole("img", { name: "Documents indexed trend" })).toBeVisible();
});
