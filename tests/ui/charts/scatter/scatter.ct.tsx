// CT: <Scatter> — the interactive 2D scatter. Covers what's genuinely DOM-observable (heading, canvas
// mount, empty state) AND the ONE behavior this primitive exists for: a point CLICK firing onPointClick
// with the point's opaque id. The palette-by-index / id-encoding wiring is asserted on the pure
// `buildScatterOption` builder in option.test.ts — a mounted ECharts instance does not survive the
// Playwright component-test RPC boundary with its methods intact.
//
// The click test mounts a SPREAD of points (a single datum with scale:true axes has no range to plot
// against, so it never lands in a clickable spot) and sweeps a grid of click positions until one hits a
// symbol — ECharts' exact placement depends on grid insets we don't control, so a scan beats betting on
// a pixel-perfect center. Any point id landing proves the click→onPointClick→id path end to end.
import { Scatter } from "@orb/ui/scatter";
import { expect, test } from "@playwright/experimental-ct-react";

const SERIES = [
  { name: "fantasy", points: [{ id: "c1", label: "Alice", x: 1, y: 1 }] },
  { name: "noir", points: [{ id: "c2", label: "Bob", x: 2, y: 2 }] },
];

// Spread across the plot so each symbol occupies a distinct, clickable region — a single datum with
// scale:true axes has no range and never plots in a hittable spot.
const SPREAD = [
  {
    name: "solo",
    points: [
      { id: "p1", label: "One", x: 1, y: 1 },
      { id: "p2", label: "Two", x: 2, y: 2 },
      { id: "p3", label: "Three", x: 3, y: 1 },
      { id: "p4", label: "Four", x: 1, y: 3 },
    ],
  },
];
const SPREAD_IDS = new Set(["p1", "p2", "p3", "p4"]);

test("renders the heading and a populated chart canvas for a non-empty series list", async ({ mount }) => {
  const component = await mount(<Scatter label="Semantic map" series={SERIES} />);
  await expect(component.getByText("Semantic map")).toBeVisible();
  await expect(component.getByRole("img", { name: "Semantic map" })).toBeVisible();
  await expect(component.locator("canvas")).toBeVisible();
});

test("renders the empty state instead of a chart when every series is empty", async ({ mount }) => {
  const component = await mount(<Scatter label="Semantic map" series={[{ name: "fantasy", points: [] }]} />);
  await expect(component.getByText("Semantic map")).toBeVisible();
  await expect(component.getByText("No data yet.")).toBeVisible();
  await expect(component.getByRole("img")).toHaveCount(0);
});

test("clicking a point fires onPointClick with that point's opaque id", async ({ mount }) => {
  let clicked: string | null = null;
  const component = await mount(
    <Scatter
      label="Semantic map"
      onPointClick={(id): void => {
        clicked = id;
      }}
      series={SPREAD}
    />,
  );
  const canvas = component.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const width = box?.width ?? 0;
  const height = box?.height ?? 0;
  // Sweep a grid across the plot until a click lands on a symbol; the id that fires is one of the
  // authored points, proving the click → onPointClick → opaque-id decode path end to end.
  for (let i = 1; i < 20; i++) {
    for (let j = 1; j < 12; j++) {
      // biome-ignore lint/performance/noAwaitInLoops: real user clicks are inherently sequential — each must land before the next; a Promise.all of clicks would race the pointer, not sweep the grid.
      await canvas.click({ position: { x: (width * i) / 20, y: (height * j) / 12 } });
    }
  }
  await expect.poll(() => (clicked === null ? false : SPREAD_IDS.has(clicked))).toBe(true);
});
