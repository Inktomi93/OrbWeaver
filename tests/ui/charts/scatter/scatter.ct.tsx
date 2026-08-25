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

// ── THE DOM KEY (`legend`) — side-eye corpus re-pass B5 ────────────────────────────────────────────────
// A categorical plot whose meaning is COLOUR is unreadable without a decoder, and a decoder drawn INTO the
// canvas is pixels: not readable-out, not zoomable, not selectable. So the key is DOM, it lives here (ui
// owns the palette, and a feature may not paint a raw element), and it carries the words — the swatch is
// aria-hidden decoration.

test("legend renders one named row per series, with its point count", async ({ mount }) => {
  const component = await mount(<Scatter label="Semantic map" legend={true} series={SERIES} />);
  const key = component.getByRole("list", { name: "Semantic map key" });
  await expect(key).toBeVisible();
  // The swatch contributes no text, so a row reads as its name then its count.
  await expect(key.getByRole("listitem")).toHaveText(["fantasy1", "noir1"]);
});

test("legend swatches take DIFFERENT palette stops, in series order", async ({ mount }) => {
  const component = await mount(<Scatter label="Semantic map" legend={true} series={SERIES} />);
  const swatches = component.locator('[data-slot="scatter-legend-item"] > span[aria-hidden="true"]');
  await expect(swatches).toHaveCount(2);
  // The VALUES are not asserted (tokens resolve to oklch and a theme may retint them) — what must hold is
  // that two series never share a stop, which is the whole claim a key makes.
  const fills = await swatches.evaluateAll((nodes) => nodes.map((n) => globalThis.getComputedStyle(n).backgroundColor));
  expect(fills[0], "a swatch with no resolved fill decodes nothing").not.toBe("");
  expect(fills[0]).not.toBe(fills[1]);
});

test("no legend by default — the key is opt-in", async ({ mount }) => {
  const component = await mount(<Scatter label="Semantic map" series={SERIES} />);
  await expect(component.locator("canvas")).toBeVisible();
  await expect(component.locator('[data-slot="scatter-legend"]')).toHaveCount(0);
});

test("an EMPTY plot draws no key — there is nothing to decode", async ({ mount }) => {
  // One mount per test: playwright-ct binds the fixture to a single component tree.
  const component = await mount(<Scatter label="Semantic map" legend={true} series={[{ name: "fantasy", points: [] }]} />);
  await expect(component.getByText("No data yet.")).toBeVisible();
  await expect(component.locator('[data-slot="scatter-legend"]')).toHaveCount(0);
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
  let box = await canvas.boundingBox();
  await expect
    .poll(async () => {
      box = await canvas.boundingBox();
      return box;
    })
    .not.toBeNull();
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
