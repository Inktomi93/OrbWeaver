// CT: the ECharts seal wrapper (ui-package-design §9 v1 corpus-viz set). Covers what's genuinely
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

test("renders and exposes its accessible name via ECharts' native aria component", async ({
  mount,
}) => {
  const component = await mount(<Chart label="Widget usage" option={BASIC_OPTION} />);
  await expect(component.getByRole("img", { name: "Widget usage" })).toBeVisible();
});

test("renders a canvas even under prefers-reduced-motion", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount(<Chart label="Widget usage" option={BASIC_OPTION} />);
  await expect(component.locator("canvas")).toBeVisible();
});

test("resizes with its container (size-sensor's ResizeObserver, no hand-rolled observer)", async ({
  mount,
}) => {
  const component = await mount(
    <div style={{ width: 300 }}>
      <Chart label="Widget usage" option={BASIC_OPTION} />
    </div>,
  );
  const canvas = component.locator("canvas");
  await expect(canvas).toBeVisible();
  const initialBox = await canvas.boundingBox();
  await component.evaluate((el) => {
    (el as HTMLElement).style.width = "600px";
  });
  await expect
    .poll(async () => (await canvas.boundingBox())?.width, { intervals: [20, 50, 100] })
    .not.toBe(initialBox?.width);
});
