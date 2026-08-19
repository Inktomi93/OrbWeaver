// CT: the ECharts seal wrapper. Covers what's genuinely
// DOM-observable: the native aria accessible-name wiring and free container resize (size-sensor's
// ResizeObserver). The reduced-motion merge logic is pure data transformation — proven by
// merge-option.test.ts, not here: a mounted ECharts instance does not survive the Playwright
// component-test RPC boundary with its methods intact (`onChartReady`'s argument arrives as a
// plain snapshot, not a live instance — `getOption()`/`getWidth()` are gone by the time a CT test
// callback runs), so option-object assertions live in plain unit tests instead.
import type { OrbChartOption } from "@orb/ui/chart";
import { Chart } from "@orb/ui/chart";
import { expect, test } from "@playwright/experimental-ct-react";

const BASIC_OPTION: OrbChartOption = {
  xAxis: { type: "category", data: ["a", "b", "c"] },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: [1, 2, 3] }],
};

test("renders and exposes its accessible name via ECharts' native aria component", async ({ mount }) => {
  const component = await mount(<Chart label="Widget usage" option={BASIC_OPTION} />);
  await expect(component.getByRole("img", { name: "Widget usage" })).toBeVisible();
});

test("renders a canvas even under prefers-reduced-motion", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount(<Chart label="Widget usage" option={BASIC_OPTION} />);
  await expect(component.locator("canvas")).toBeVisible();
});

/** The mounted container's starting width — the canvas must adopt it, and then leave it. */
const INITIAL_CONTAINER_PX = 300;

// #263 — this test was a standing deterministic red (7/8 under `--repeat-each=8`), and the defect was the
// test's timing assumption, not the primitive. TWO vendor behaviors compose into a window where a container
// resize is DROPPED ON PURPOSE:
//   • `echarts-for-react/lib/core.js` swallows the FIRST size-sensor callback outright — `isInitialResize`,
//     "resize should not happen on first render as it will cancel initial echarts animations";
//   • `size-sensor` DEBOUNCES its listener by 60ms (`size-sensor/lib/debounce.js`) and kicks it once at
//     observe time, so that swallowed first call lands ~60ms after the chart mounts.
// A single width change applied inside that 60ms window is therefore COALESCED INTO the swallowed call and
// never reaches the canvas — and Playwright drives mount → visible → boundingBox → evaluate well inside
// 60ms, which is why the old one-shot version failed deterministically and only passed when a cold vite
// build slowed the first run down. Stepping the width once per poll interval means at least one change is
// delivered as a NON-initial event, so this asserts the durable contract (the canvas follows its container,
// via size-sensor's ResizeObserver, with no hand-rolled observer in `chart.tsx`) without encoding the
// vendor's debounce constant. Residual real-world behavior, unchanged and out of this test's scope: a
// container that resizes within ~60ms of chart init is ignored until the next resize.
test("resizes with its container (size-sensor's ResizeObserver, no hand-rolled observer)", async ({ mount }) => {
  const component = await mount(
    <div style={{ width: INITIAL_CONTAINER_PX }}>
      <Chart label="Widget usage" option={BASIC_OPTION} />
    </div>,
  );
  const canvas = component.locator("canvas");
  await expect(canvas).toBeVisible();
  expect((await canvas.boundingBox())?.width).toBe(INITIAL_CONTAINER_PX);

  // Each iteration must ask for a DIFFERENT width: re-setting the same value produces no ResizeObserver
  // entry at all, so a fixed target would deadlock the moment its one event was the swallowed one.
  let requestedPx = 2 * INITIAL_CONTAINER_PX;
  await expect
    .poll(
      async () => {
        await component.evaluate((el, px) => {
          (el as HTMLElement).style.width = `${px}px`;
        }, requestedPx);
        requestedPx += 1;
        return (await canvas.boundingBox())?.width;
      },
      { intervals: [120, 120, 120, 120, 120], timeout: 5000 },
    )
    .toBeGreaterThan(INITIAL_CONTAINER_PX);
});
