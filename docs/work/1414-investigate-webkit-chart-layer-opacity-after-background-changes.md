---
kind: bug
status: open
updated: 2026-10-30
priority: P1
area: ui
plan: surface-walk
---

# Investigate WebKit chart layer opacity after background changes

## What

A WebKit upper canvas becomes opaque after root background changes and obscures correctly colored chart data. A bare installed ECharts reproduction excludes React and application fixture code; the native cause remains unproven.

## Why

Correct color values and geometry do not establish visible data when an opaque canvas covers the plot.

## Done when

Identify the native or vendor cause with a minimal retained reproduction. Qualify a supported fix or precise platform limitation with actual composited pixels, theme transitions and unchanged chart data. Do not hide the failure with a z-level workaround.

## Evidence

Status: observed but intermittent; the trigger is unknown. The item stays open until the defect reproduces on demand.

- Observed shape: in Playwright's WebKit (27.2, Playwright 1.64.1, Linux) with the `iPhone 15` descriptor, a root background change filled every never-painted pixel of a large 2D canvas with that background, opaque. Painted pixels, opaque and translucent, kept their values. The filled canvas covered the canvases below it, which is how the upper zrender layer hid heatmap cells. React, ECharts and application CSS were not needed: the bare script below showed it.
- Controls that never showed it, in the same runs where it did fire: the same canvas with `willReadFrequently: true`, a 100x50 backing, `Desktop Safari`, `isMobile` at device scale factor 1, and Chromium with the iPhone descriptor.
- Measured rates for the first case of the script below:

| Run | Load (1 min) | Fired |
| - | - | - |
| Lane, standalone script | about 11 | 20 of 20 |
| Lane, the same page in the component-test runner, `--workers=1` | about 8 to 13 | 10 of 10 |
| Lane, the same page in the runner beside parallel workers | about 8 to 13 | 2 of 10, 2 of 10, 3 of 10 |
| Lane, heatmap paint suite WebKit runs (upper chart layer) | about 11 | 3 of 5 |
| Review, standalone script | 6.6 to 8.3 | 0 of 25 |
| Review, runner `--workers=1`, accelerated case | 6.6 to 8.3 | 0 of 11 |
| Lane rerun, standalone script | 7.2 | 0 of 20 |
| Lane rerun beside eight synthetic CPU spinners | 12.2 | 0 of 10 |

- Not the trigger: CPU load alone, per the last row. Other host state, such as GPU or compositor state or concurrent browser processes, was not isolated.
- Chart data stayed correct while it fired: the cell layer read the live series token while the composited cells read the root background, `rgb(15, 12, 10)`. `tests/ui/charts/heatmap/platform-heatmap-paint.suite.ct.tsx` asserts each renderer layer and the topmost legend layer, which this defect does not corrupt.
- No fix is shipped. zrender calls `getContext("2d")` with no attributes and ECharts exposes no context setting; a global `getContext` patch, a vendor patch or a z-level change would hide the defect without explaining it. Real iOS Safari was not available to test.

### Reproduction

Save as a `.mjs` file and run `node <file> 20` from the repository root. Each case prints its outcomes. When the defect fires, `empty` reads `15,12,10,255` in the first case only; otherwise every case reads `0,0,0,0`.

```js
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(`${process.cwd()}/package.json`);
const { chromium, devices, webkit } = require("@playwright/test");
const trials = Number(process.argv[2] ?? "20");
const { defaultBrowserType: _webkit, ...iphone } = devices["iPhone 15"];
const { defaultBrowserType: _safari, ...desktopSafari } = devices["Desktop Safari"];
const html = '<!doctype html><body style="margin:0"><div style="position:absolute;left:0;top:0;width:200px;height:100px;background:rgb(0,160,0)"></div></body>';

async function probe(page, { width, height, willReadFrequently }) {
  await page.setContent(html);
  return await page.evaluate(async ({ width, height, willReadFrequently }) => {
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    canvas.style.cssText = "position:absolute;left:0;top:0;width:200px;height:100px";
    document.body.append(canvas);
    const context = canvas.getContext("2d", { willReadFrequently });
    context.fillStyle = "rgb(247, 127, 32)";
    context.fillRect(0, 0, 10, 10);
    context.fillStyle = "rgba(247, 127, 32, 0.5)";
    context.fillRect(10, 0, 10, 10);
    const read = (x) => [...context.getImageData(x, 5, 1, 1).data].join(",");
    await frames();
    document.documentElement.style.backgroundColor = "rgb(15, 12, 10)";
    await frames();
    await frames();
    return { opaque: read(5), translucent: read(15), empty: read(40) };
  }, { width, height, willReadFrequently });
}

const cases = [
  ["webkit iPhone 15, 1245x720", webkit, iphone, { width: 1245, height: 720, willReadFrequently: false }],
  ["webkit iPhone 15, willReadFrequently", webkit, iphone, { width: 1245, height: 720, willReadFrequently: true }],
  ["webkit iPhone 15, 100x50", webkit, iphone, { width: 100, height: 50, willReadFrequently: false }],
  ["webkit Desktop Safari", webkit, desktopSafari, { width: 1245, height: 720, willReadFrequently: false }],
  ["webkit isMobile at scale 1", webkit, { ...iphone, deviceScaleFactor: 1 }, { width: 1245, height: 720, willReadFrequently: false }],
  ["chromium iPhone 15", chromium, iphone, { width: 1245, height: 720, willReadFrequently: false }],
];
for (const [name, engine, device, canvas] of cases) {
  const browser = await engine.launch();
  const outcomes = new Map();
  for (let trial = 0; trial < trials; trial++) {
    const context = await browser.newContext(device);
    const key = JSON.stringify(await probe(await context.newPage(), canvas));
    outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
    await context.close();
  }
  console.log(name, Object.fromEntries(outcomes));
  await browser.close();
}
```

For the component-test runner, mount the same document with `page.setContent` in a `platform-*.suite.ct.tsx` file and run `pnpm test:ct:webkit <file> --repeat-each=10 --workers=1`.

### Lead: the Skia GPU canvas path

Playwright's Linux WebKit is the GTK/WPE port, which accelerates 2D canvas through Skia on the GPU ([WebKit bug 274305](https://bugs.webkit.org/show_bug.cgi?id=274305), [WebKit bug 291678](https://bugs.webkit.org/show_bug.cgi?id=291678)). A downstream report shows WebKitGTK 2.52 leaving unpainted output on one GPU driver through that path and recovering with `WEBKIT_SKIA_ENABLE_CPU_RENDERING=1` ([block/buzz#2643](https://github.com/block/buzz/issues/2643)). The observed controls fit the GPU path: a `willReadFrequently` canvas, which stays on the CPU, never showed the defect, and CPU load alone did not trigger it. This box renders through the Intel UHD 770 on Mesa 25.2.8; its two NVIDIA GPUs run the model engines.

Next test: run the reproduction script with and without `WEBKIT_SKIA_ENABLE_CPU_RENDERING=1` across several sessions, recording the Mesa version, which GPU WebKit's EGL selects, and whether the model engines hold GPU load. A CPU-rendering run that never fires while the default run fires confirms the path. Then file the bug upstream with the bare-HTML reproduction.
