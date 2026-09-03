// snap's shot density, proved on the PNG BYTES a real headless chromium wrote (#915). Nothing here reads
// an intent flag — the assertion is the IHDR width/height of the file on disk, because "the option was
// threaded" is exactly the claim that can be true while the pixels are unchanged.
//
// THE DEFAULT IS THE POINT. `--scale` exists so a human-read design-mock render can be 2x; the agent-read
// default must stay `css`. The first arm is a byte-level pin on that default, so a later "fix" of
// SHOT_BASE reds here rather than silently doubling every run's image tokens.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
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
