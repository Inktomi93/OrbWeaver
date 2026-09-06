// snap's shot density, proved on the PNG BYTES a real headless chromium wrote (#915). Nothing here reads
// an intent flag — the assertion is the IHDR width/height of the file on disk, because "the option was
// threaded" is exactly the claim that can be true while the pixels are unchanged.
//
// THE DEFAULT IS THE POINT. `--scale` exists so a human-read design-mock render can be 2x; the agent-read
// default must stay `css`. The first arm is a byte-level pin on that default, so a later "fix" of
// SHOT_BASE reds here rather than silently doubling every run's image tokens.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import sharp from "sharp";
import { vi } from "vitest";
import type { CliResult } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);

// THE FILE-LEVEL CEILING (#1232 residue, measured 2026-09-03). vitest.config.ts states the law for this
// lane in as many words: its own `testTimeout` is a BACKSTOP and "every file in this lane sets its own
// `vi.setConfig` from `scaledBudget(...)`". This file declared scaled ceilings for its CHILD PROCESSES
// and never for the TESTS, so every arm here drove a real Chromium under the parallel lane's unscaled 5 s
// default and timed out under whole-suite contention while passing standalone. A per-test annotation is
// not the fix — the arms without one are exactly the ones that flaked.
// 2x the child ceiling, matching the first arm's own inline declaration.
vi.setConfig({ testTimeout: 2 * BROWSER_TIMEOUT_MS, hookTimeout: 2 * BROWSER_TIMEOUT_MS });

const PNG_IHDR_WIDTH_OFFSET = 16;
const PNG_IHDR_HEIGHT_OFFSET = 20;

const MOCK_HTML = `<!doctype html><html data-app-ready="settled"><body style="margin:0;background:#ffffff">
<h1 style="font:24px system-ui;color:#111111">scale plant</h1>
</body></html>`;

/** The PNG's own header — the only honest source for "what did this run actually produce". */
function pngSize(path: string): { readonly width: number; readonly height: number } {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(PNG_IHDR_WIDTH_OFFSET), height: bytes.readUInt32BE(PNG_IHDR_HEIGHT_OFFSET) };
}

test("the css default renders 1 image px per CSS px, and --scale 2 renders exactly 2x", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  scratch,
  runCli,
}) => {
  const root = await plantedTree({ "mock.html": MOCK_HTML });
  const argv = ["--file", `${root}/mock.html`, "--viewport", "800x600", "--no-failure-evidence"];

  const cssOut = join(scratch, "css.png");
  const css = await runCli("snap", [...argv, "--out", cssOut], { timeoutMs: BROWSER_TIMEOUT_MS });
  await expect(css).toExitWith(EXIT.clean);
  expect(pngSize(cssOut)).toEqual({ width: 800, height: 600 });
  // A run that did not ask for a scale still SAYS what it produced.
  expect(css.stdout).toContain("scale=css/800x600");

  const deviceOut = join(scratch, "device.png");
  const scaled = await runCli("snap", [...argv, "--scale", "2", "--out", deviceOut], { timeoutMs: BROWSER_TIMEOUT_MS });
  await expect(scaled).toExitWith(EXIT.clean);
  expect(pngSize(deviceOut)).toEqual({ width: 1600, height: 1200 });
  expect(scaled.stdout).toContain("scale=2/1600x1200");
  // PLANTED CONTROL for the honest arm: the raised DPR is DECLARED to the environment contract, so the
  // identity check observes devicePixelRatio 2 and agrees. A `--scale` that moved the pixels behind the
  // contract's back would read here as environment-fails=1 — the check stays live, it is not blinded.
  expect(scaled.stdout).toContain("environment-fails=0");
});

test("--scale refuses loudly rather than silently writing a huge PNG or a nonsense density", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "mock.html": MOCK_HTML });
  const file = ["--file", `${root}/mock.html`, "--no-failure-evidence"];

  // Over the image budget: refused BEFORE a browser is launched, with the projected dimensions named.
  const huge = await runCli("snap", [...file, "--viewport", "4000x4000", "--scale", "2"]);
  await expect(huge).toExitWith(EXIT.misuse);
  expect(huge.stdout).toContain("8000x8000");
  expect(huge.stdout).toContain("image budget");

  // A value that is not one of the three spellings REFUSES; it never falls back to the css default.
  const bogus = await runCli("snap", [...file, "--scale", "retina"]);
  await expect(bogus).toExitWith(EXIT.misuse);
  expect(bogus.stdout).toContain(`--scale expects css | device | a number >= 1, got "retina"`);

  // A numeric scale would have to overrule the device descriptor's own DPR — refused, with the
  // composing spelling named, rather than one of the two silently winning.
  const both = await runCli("snap", [...file, "--mobile", "--scale", "2"]);
  await expect(both).toExitWith(EXIT.misuse);
  expect(both.stdout).toContain("use --scale device");
});

// ── #1517 — the paint-completion signal a geometry comparison structurally cannot observe ──────────
// An image with RESERVED layout space (explicit width/height, or an aspect-ratio box — the normal case in
// this codebase) paints blank-then-content at IDENTICAL dimensions, so
// `[scrollWidth, scrollHeight, clientWidth, clientHeight, body.scrollHeight, body.childElementCount]` is
// byte-identical before and after it lands. The old settle saw two matching frames instantly and fired the
// shutter on the blank frame.
//
// WHAT #1517 ALSO CLAIMED, AND WHAT THE TREE SAYS (re-derived 2026-09-05). The row named a webfont swap as
// the second uncovered case. It is covered — by Playwright, not by us: `page.screenshot()` awaits
// `document.fonts.ready` itself (receipt: a `page.screenshot: Timeout 30000ms exceeded … waiting for fonts
// to load...` call log from a fixture whose font never resolved). Because Chromium resolves that promise
// only after the document's load event, it ALSO covers an image that is late in the INITIAL load. So the
// live gap is exactly an image that starts loading AFTER load — a lazy image, or content a query brings in
// once the app is settled, which is what this app's surfaces are made of — plus the decode window.
//
// THE PLANT IS ANCHORED TO A RUN PHASE, NOT TO A WALL CLOCK. Three clock-based fixtures were tried first
// and all three passed against the OLD code (a fence, not a proof): everything the run does before the
// shutter — readiness, mount settle, the evidence pass — is seconds long and swallowed the delay. Here the
// late image is requested by `window.__orb.snap()`, which the app-snapshot arm calls in the evidence pass,
// immediately before the shutter. If that call ever stops happening the image never loads and this arm
// goes RED — it fails closed, never silently green.
const LATE_IMAGE_MS = 1000;
const PLANT_VIEWPORT = "800x400";

const PLANT_MODES = ["eager", "late", "missing"] as const;
type PlantMode = (typeof PLANT_MODES)[number];

/** `eager` puts the image in the markup (the artifact every arm is compared against); `late` and
 *  `missing` leave the slot empty until the app-snapshot arm asks the page for its snapshot. */
function plantPage(mode: PlantMode): string {
  const src = mode === "eager" ? ' src="/plant.png"' : "";
  const late = mode === "eager" ? "" : `document.getElementById('plant-image').src='/plant.png';`;
  return `<!doctype html><html lang="en" data-app-ready="settled"><head><style>
html,body{margin:0;background:#ffffff}
#plant-image{display:block;width:200px;height:120px}
</style></head><body>
<img id="plant-image"${src} width="200" height="120" alt="decode plant">
<script>globalThis.__orb={snap:()=>{${late}return {fixture:true}},flags:()=>[],resetEvidence:()=>{},consoleErrors:()=>({records:[],dropped:0,cap:128})};</script>
</body></html>`;
}

async function plantPaintServer(
  mode: PlantMode,
  png: Buffer,
): Promise<{ readonly base: string; readonly imageRequests: () => number; readonly close: () => Promise<void> }> {
  let imageRequests = 0;
  const server = createServer((request, response) => {
    if (request.url !== "/plant.png") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(plantPage(mode));
      return;
    }
    imageRequests += 1;
    if (mode === "missing") {
      response.writeHead(404);
      response.end();
      return;
    }
    const send = (): void => {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(png);
    };
    if (mode === "eager") {
      send();
      return;
    }
    // Comfortably past the two animation frames the geometry loop spends, and far inside
    // PAINT_SETTLE_RESOURCE_MS — the margin is what keeps this arm able to fail on a contended box.
    setTimeout(send, LATE_IMAGE_MS);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    imageRequests: (): number => imageRequests,
    close: async (): Promise<void> => {
      // A keep-alive socket the browser has not released would otherwise hold close() open.
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    },
  };
}

/** The decoded pixels — the only honest answer to "what does this artifact SHOW". The `Promise.resolve`
 *  wrap is the house idiom for sharp's thenable (see tooling/src/snap/ops/contrast-pixels.ts). */
async function shotPixels(path: string): Promise<Buffer> {
  return await Promise.resolve(sharp(path).raw().toBuffer());
}

test("the shot waits for an image that starts loading after the app settled, not just for stable geometry", { timeout: 4 * BROWSER_TIMEOUT_MS }, async ({
  runCli,
  scratch,
}) => {
  const png = await Promise.resolve(
    sharp({ create: { width: 200, height: 120, channels: 3, background: { r: 255, g: 0, b: 255 } } })
      .png()
      .toBuffer(),
  );

  const capture = async (mode: PlantMode): Promise<{ readonly out: string; readonly run: CliResult; readonly imageRequests: number }> => {
    const server = await plantPaintServer(mode, png);
    const out = join(scratch, `paint-settle-${mode}.png`);
    try {
      const run = await runCli("snap", ["/", "--base", server.base, "--viewport", PLANT_VIEWPORT, "--out", out, "--no-deadcss", "--no-failure-evidence"], {
        timeoutMs: BROWSER_TIMEOUT_MS,
      });
      expect(run.timedOut, `the ${mode} arm did not finish inside its own child budget:\n${run.stdout}`).toBe(false);
      // PLANTED CONTROL (the plant fired at all): a fixture whose late image was never REQUESTED would
      // make every comparison below trivially true for the wrong reason.
      expect(server.imageRequests(), `the ${mode} arm never requested the plant image:\n${run.stdout}`).toBeGreaterThan(0);
      return { out, run, imageRequests: server.imageRequests() };
    } finally {
      await server.close();
    }
  };

  const eagerRun = await capture("eager");
  const lateRun = await capture("late");
  // The CONTROL arm's exit is deliberately unasserted: a 404 asset is a real failed-request finding, so
  // its exit code is about the planted server rather than about the settle.
  const missingRun = await capture("missing");

  const eager = await shotPixels(eagerRun.out);
  const late = await shotPixels(lateRun.out);
  const missing = await shotPixels(missingRun.out);

  // PLANTED CONTROL (negative direction): the comparison is capable of failing. A 404 leaves the reserved
  // box empty, so those pixels MUST differ — if this passed, the equality below would prove nothing.
  expect(missing.equals(eager), "a 404 image produced pixels identical to the painted one — the fixture cannot detect a missed paint").toBe(false);
  // …and the artifact is a full-size capture either way, never truncated or absent: the settle's resource
  // bound spends itself against an absent image and the shutter still fires.
  expect(missing.length).toBe(eager.length);

  // THE DEFECT (positive direction): the post-settle image must have reached the artifact.
  expect(late.equals(eager), "the shutter fired before the post-settle image decoded").toBe(true);
});
