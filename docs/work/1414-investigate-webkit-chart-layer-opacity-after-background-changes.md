---
kind: bug
status: doing
updated: 2026-11-06
priority: P1
area: ui
lane: wt/agent-a8be2c9e358ff6ae8
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

Playwright's Linux WebKit is the GTK/WPE port, which accelerates 2D canvas through Skia on the GPU ([WebKit bug 274305](https://bugs.webkit.org/show_bug.cgi?id=274305), [WebKit bug 291678](https://bugs.webkit.org/show_bug.cgi?id=291678)). A downstream report shows WebKitGTK 2.52 leaving unpainted output on one GPU driver through that path and recovering with `WEBKIT_SKIA_ENABLE_CPU_RENDERING=1` ([block/buzz#2643](https://github.com/block/buzz/issues/2643)). The observed controls fit the GPU path: a `willReadFrequently` canvas, which stays on the CPU, never showed the defect, and CPU load alone did not trigger it. This lead is unconfirmed: the test below never fired, so it separates nothing.

### CPU-rendering test: never fired on demand

Five standalone sessions and two runner rounds ran the first case with and without `WEBKIT_SKIA_ENABLE_CPU_RENDERING=1`. The default run never fired, so a quiet CPU run proves nothing about the path. No cause is shown and no upstream bug is drafted.

| Run | Mode | Load (1 min) | Fired |
| - | - | - | - |
| Standalone, accelerated canvas | default | 7.8 to 29.2 | 0 of 100 |
| Standalone, accelerated canvas | CPU rendering | 8.1 to 30.1 | 0 of 100 |
| Standalone, four concurrent pages per browser | default | 7.8 to 29.2 | 0 of 100 |
| Standalone, four concurrent pages per browser | CPU rendering | 8.1 to 30.1 | 0 of 100 |
| Standalone, `willReadFrequently` control | default and CPU rendering | 7.8 to 30.1 | 0 of 200 |
| Standalone, Mesa EGL vendor only | default | 8.1 to 28.2 | 0 of 100 accelerated, 0 of 100 concurrent |
| Standalone, Mesa vendor with `WPE_DRM_DEVICE` and `DRI_PRIME` on the Intel GPU | default | 14.9 to 15.4 | 0 of 40 accelerated, 0 of 40 concurrent |
| Runner, `--workers=1` | default | 13.4 to 16.0 | 0 of 40 |
| Runner, `--workers=1` | CPU rendering | 13.7 to 15.3 | 0 of 40 |
| Runner, `--workers=4` | default | 12.3 to 15.2 | 0 of 40 |
| Runner, `--workers=4` | CPU rendering | 13.4 to 15.2 | 0 of 40 |

State recorded across those runs:

- Software: Playwright WebKit build 2370 (the WPE MiniBrowser), Mesa 25.2.8-0ubuntu0.24.04.4, NVIDIA driver 580.178.04. The WebKit library contains the `WEBKIT_SKIA_ENABLE_CPU_RENDERING` string.
- GPU selection: by default, WebKit's EGL takes the NVIDIA path, not the Intel UHD 770. `MiniBrowser` and `WPEWebProcess` hold `/dev/nvidia0`, `/dev/nvidia1`, `renderD129` and, for `WPEWebProcess`, `renderD130`, and map `libEGL_nvidia` and `libnvidia-eglcore`. `libEGL_mesa` is mapped too. `renderD129` is the NVIDIA card at PCI 01:00.0, `renderD130` the one at 02:00.0, and `renderD128` the Intel GPU, which no default run opened.
- CPU rendering keeps those same descriptors, so the descriptors do not show which path painted.
- Mesa modes: with the Mesa EGL vendor alone, neither process opened any DRM node, with or without the Intel settings. Those rows did not exercise the Intel GPU, so the Intel path remains untested.
- Model engines: `llm-flashnext` and `llama-swap` were up throughout. They held 44849 MiB and 44480 MiB of the two 49140 MiB A6000s. One sample per standalone mode read 0 to 20 percent on GPU 0 and 0 percent on GPU 1. No sampled run had engine compute load that this test can attribute. Engines were not started or stopped.
- WebGL reports the masked `Apple GPU`, so it identifies nothing.

The runs in the first table did not record the GPU path they used. Whether engine load, free GPU memory or another host state decides the defect is not shown.

Next test: when the defect next fires in any WebKit CT run, run the script with and without `WEBKIT_SKIA_ENABLE_CPU_RENDERING=1` in that same box state, and record `nvidia-smi` and the descriptors above. A CPU-rendering run that never fires while the default run fires confirms the path. Then file the bug upstream with the bare-HTML reproduction.
