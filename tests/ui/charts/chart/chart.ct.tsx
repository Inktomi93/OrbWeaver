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

test("a cold renderer import announces loading and preserves numeric and percentage chart geometry", async ({ mount, page }, testInfo) => {
  const rendererGate = Promise.withResolvers<void>();
  let rendererRequests = 0;
  await page.route("**/assets/chart-renderer-*.js", async (route) => {
    rendererRequests += 1;
    await rendererGate.promise;
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "dark", forcedColors: "none" });
  try {
    const component = await mount(
      <div style={{ width: 280 }}>
        <Chart height={160} label="Numeric chart" option={BASIC_OPTION} />
        <div style={{ display: "flex", flexDirection: "column", height: 400 }}>
          <Chart height="100%" label="Percentage chart" option={BASIC_OPTION} />
        </div>
      </div>,
    );
    const numeric = component.locator('[data-slot="chart"]').nth(0);
    const percentage = component.locator('[data-slot="chart"]').nth(1);
    await expect.poll(() => rendererRequests).toBe(1);
    await expect(component.locator("canvas")).toHaveCount(0);
    await expect(numeric.getByRole("status")).toHaveText("Loading Numeric chart");
    await expect(percentage.getByRole("status")).toHaveText("Loading Percentage chart");
    await expect(numeric.locator('[data-slot="web-spinner"] svg')).toBeVisible();
    await expect(percentage.locator('[data-slot="web-spinner"] svg')).toBeVisible();
    await expect(component.getByRole("img")).toHaveCount(0);
    await expect.poll(() => numeric.boundingBox()).toMatchObject({ width: 280, height: 160 });
    await expect.poll(() => percentage.boundingBox()).toMatchObject({ width: 280, height: 400 });
    await testInfo.attach("chart-loading", { body: await component.screenshot(), contentType: "image/png" });
    await testInfo.attach("chart-loading-aria", { body: await component.ariaSnapshot(), contentType: "text/plain" });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
    await expect(component.locator('[data-slot="web-spinner"][data-animate]')).toHaveCount(0);
    await expect(numeric.locator('[data-slot="web-spinner"] svg')).toBeVisible();
    rendererGate.resolve();
    await expect(numeric.locator("canvas")).toBeVisible();
    await expect(percentage.locator("canvas")).toBeVisible();
    await expect(component.getByRole("status")).toHaveCount(0);
    await expect(numeric.getByRole("img", { name: "Numeric chart", exact: true })).toBeVisible();
    await expect(percentage.getByRole("img", { name: "Percentage chart", exact: true })).toBeVisible();
    await expect.poll(() => numeric.locator("canvas").boundingBox()).toMatchObject({ width: 280, height: 160 });
    await expect.poll(() => percentage.locator("canvas").boundingBox()).toMatchObject({ width: 280, height: 400 });
  } finally {
    rendererGate.resolve();
  }
});

test("renders and exposes its accessible name via ECharts' native aria component", async ({ mount }) => {
  const component = await mount(<Chart label="Widget usage" option={BASIC_OPTION} />);
  await expect(component.locator("canvas")).toBeVisible();
  await expect(component.getByRole("img", { name: "Widget usage" })).toBeVisible();
});

test("renders a canvas even under prefers-reduced-motion", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount(<Chart label="Widget usage" option={BASIC_OPTION} />);
  await expect(component.locator("canvas")).toBeVisible();
});

// ── A PERCENTAGE HEIGHT HAS TO REACH THE CANVAS (side-eye corpus re-pass #3, P2-A) ────────────────────
// `height="100%"` landed on the ECharts <div> while the wrapper stayed `height: auto`, so the percentage
// resolved against an auto-height parent — which CSS treats as `auto` — and echarts fell to its own floor.
// The measured symptom: a 100px strip of semantic map inside a 693px panel. The host below is the shape
// every real caller has (LabeledChartFrame is a flex column with a definite height), and the assertion is
// the CANVAS, not the wrapper: the wrapper was tall the whole time, which is why the map tab's own
// dead-foot test stayed green while the plot was a strip.
const PERCENT_HOST_PX = 400;
/** How much of a definite-height flex host a `height="100%"` chart must actually take. Not 100%: the host
 *  in production also carries a heading and a key, and this one carries the sibling below. */
const PERCENT_FILL_RATIO = 0.6;

test("a percentage height reaches the CANVAS, not just the wrapper (P2-A)", async ({ mount }) => {
  const component = await mount(
    <div style={{ display: "flex", flexDirection: "column", height: PERCENT_HOST_PX, width: 320 }}>
      <Chart height="100%" label="Widget usage" option={BASIC_OPTION} />
    </div>,
  );
  const canvas = component.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, { intervals: [20, 50, 100, 200] })
    .toBeGreaterThanOrEqual(PERCENT_HOST_PX * PERCENT_FILL_RATIO);
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
  await expect.poll(async () => (await canvas.boundingBox())?.width, { intervals: [20, 50, 100] }).toBe(INITIAL_CONTAINER_PX);

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
