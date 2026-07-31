// <SegmentBar> CT — the stacked composition rail (panel-redesign preview.html's context-budget bar). Its
// whole job: each segment's WIDTH is its share of the whole, its COLOR is a D71 ramp token, and the rail is
// aria-hidden (the datum is the SeriesRow text beside it). Assert computed geometry + resolved token colors,
// never a hardcoded px/hex.
import { SegmentBar } from "@orb/ui/meter";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const SEGMENTS = [
  { id: "system", value: 25, color: 1 as const },
  { id: "cards", value: 50, color: 4 as const },
  { id: "history", value: 25, color: 5 as const },
];

test("segments partition the rail: widths are each series' share of the sum", async ({ mount }) => {
  const component = await mount(<SegmentBar segments={SEGMENTS} />);
  const rail = await component.boundingBox();
  const widths = await Promise.all(
    SEGMENTS.map(async (s) => {
      const box = await component.locator(`[data-segment=${s.id}]`).boundingBox();
      return (box?.width ?? 0) / (rail?.width ?? 1);
    }),
  );

  expect(widths[0]).toBeGreaterThan(0.23);
  expect(widths[0]).toBeLessThan(0.27);
  expect(widths[1]).toBeGreaterThan(0.48);
  expect(widths[1]).toBeLessThan(0.52);
  // …and together they fill the whole rail (a composition bar leaves no unexplained gap).
  expect(widths.reduce((sum, w) => sum + w, 0)).toBeGreaterThan(0.98);
});

/** The browser re-serializes a color function's components with trailing zeros STRIPPED, so a token whose
 *  authored lightness carries one (track-5) can never string-match the computed style. Compare the NUMBERS —
 *  still the generated token value, never a literal. */
const COLOR_COMPONENT_RE = /[\d.]+/g;
function colorComponents(color: string): number[] {
  return [...color.matchAll(COLOR_COMPONENT_RE)].map((m) => Number(m[0]));
}

test("each segment rides its own track-ramp step (the categorical series colors)", async ({ mount }) => {
  const component = await mount(<SegmentBar segments={SEGMENTS} />);
  await expect(component.locator("[data-segment=system]")).toHaveCSS("background-color", TOKENS["color.track-1"].value);
  await expect(component.locator("[data-segment=cards]")).toHaveCSS("background-color", TOKENS["color.track-4"].value);

  const history = await component.locator("[data-segment=history]").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(colorComponents(history)).toEqual(colorComponents(TOKENS["color.track-5"].value));
});

test("an explicit `total` leaves the unused remainder as EMPTY rail (visible headroom)", async ({ mount }) => {
  // 100 used of a 200 domain ⇒ the segments occupy half the rail, the rest stays track.
  const component = await mount(<SegmentBar segments={SEGMENTS} total={200} />);
  const rail = await component.boundingBox();
  const filled = await Promise.all(SEGMENTS.map(async (s) => (await component.locator(`[data-segment=${s.id}]`).boundingBox())?.width ?? 0));
  const fraction = filled.reduce((sum, w) => sum + w, 0) / (rail?.width ?? 1);
  expect(fraction).toBeGreaterThan(0.48);
  expect(fraction).toBeLessThan(0.52);
});

test("a total SMALLER than the sum can't overflow the rail (clamped, never misdrawn)", async ({ mount }) => {
  const component = await mount(<SegmentBar segments={SEGMENTS} total={10} />);
  const rail = await component.boundingBox();
  const filled = await Promise.all(SEGMENTS.map(async (s) => (await component.locator(`[data-segment=${s.id}]`).boundingBox())?.width ?? 0));
  expect(filled.reduce((sum, w) => sum + w, 0)).toBeLessThanOrEqual((rail?.width ?? 0) + 1);
});

test("zero/negative series are dropped — never a 0-width sliver", async ({ mount }) => {
  const component = await mount(
    <SegmentBar
      segments={[
        { id: "system", value: 10, color: 1 },
        { id: "empty", value: 0, color: 2 },
      ]}
    />,
  );
  await expect(component.locator("[data-segment=empty]")).toHaveCount(0);
  await expect(component.locator("[data-slot=segment-bar-segment]")).toHaveCount(1);
});

test("the rail is decorative — aria-hidden, no role, no accessible value", async ({ mount }) => {
  const component = await mount(<SegmentBar segments={SEGMENTS} />);
  await expect(component).toHaveAttribute("aria-hidden", "true");
  await expect(component).not.toHaveAttribute("role", "meter");
});
