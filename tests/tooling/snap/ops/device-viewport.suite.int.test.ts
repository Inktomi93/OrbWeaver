// @instrument-proof: WHICH DEVICE DID THIS RUN MEASURE? (#1668). `--mobile --viewport 320x740` kept the
// size and silently dropped `pointer: coarse` + DPR 3 + the mobile UA — a lane reading "320 coarse" was
// measuring a DESKTOP at 320 and reporting chrome numbers ~40px short of the touch floor, with no warning
// and no refusal. The cause was one line of argv policy (`ops/flags-handlers.ts`: `--viewport` set
// `device = null`, on a "these are mutually exclusive slots" rule), and the mirror image was just as
// silent: `--viewport 320x740 --mobile` kept the device and DROPPED the 320.
//
// These arms assert through the PAGE (`matchMedia`, `devicePixelRatio`, the UA) and through the RESULT
// line's own `device=` receipt — never through the flag table's internals, because the defect was that
// argv and the browser disagreed. Both directions are pinned in the same file: a viewport override under
// `--mobile` must stay coarse, and a bare `--viewport` must stay FINE at DPR 1, or the fix would have
// "worked" by making every viewport coarse.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { BOX_LOAD_ENV } from "@orb/tooling/_shared/load-budget";
import { beforeEach, vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(180_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const QUIET = ["--no-shot", "--no-deadcss", "--no-failure-evidence"];

/** A planted quiet box (#1651's class): a contended host labels the rate arms `load-suspect` and adds a
 *  run-global annotation, none of which is about the device contract these arms pin. */
beforeEach(() => {
  vi.stubEnv(BOX_LOAD_ENV, "0.2/24");
});

/** The one in-page read that decides this row: what the BROWSER says, not what argv asked for. */
const DEVICE_EVAL =
  "(() => ({ coarse: matchMedia('(pointer: coarse)').matches, dpr: devicePixelRatio, touch: 'ontouchstart' in window, iphone: navigator.userAgent.includes('iPhone') }))()";

const PAGE =
  '<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>device</title></head><body><main>x</main></body></html>';

async function fixture(scratch: string, name: string): Promise<string> {
  const file = join(scratch, name);
  await writeFile(file, PAGE);
  return file;
}

/** The `device=<pointer>:dpr<n>:<WxH>` token the RESULT line carries — the receipt a reader checks before
 *  trusting any geometry number in the run. */
function deviceReceipt(stdout: string): string {
  const token = stdout.split(/\s+/u).find((entry) => entry.startsWith("device="));
  expect(token, `no device= token in:\n${stdout}`).toBeTypeOf("string");
  return String(token).slice("device=".length);
}

test("#1668 — a --viewport under --mobile WINDOWS the device: coarse + DPR 3 survive, at the asked size", async ({ runCli, scratch }) => {
  const file = await fixture(scratch, "mobile-viewport.html");
  const run = await runCli("snap", ["--file", file, "--mobile", "--viewport", "320x740", "--eval", DEVICE_EVAL, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(run).toExitWith(EXIT.clean);
  // THE PAGE'S OWN ANSWER. Before the fix this printed `"coarse": false, "dpr": 1` and an X11 user agent.
  expect(run.stdout).toContain('"coarse": true');
  expect(run.stdout).toContain('"dpr": 3');
  expect(run.stdout).toContain('"touch": true');
  expect(run.stdout).toContain('"iphone": true');
  // …and the size the caller asked for is the size it got — the override is honoured, not ignored.
  expect(deviceReceipt(run.stdout)).toBe("coarse:dpr3:320x740");
});

test("#1668 — argv ORDER does not change the device: --viewport before --mobile is the same run", async ({ runCli, scratch }) => {
  // The mirror defect, which the row did not know about: written in this order the device used to win and
  // the explicit 320 was dropped in silence (the run reported the iPhone's own 430).
  const file = await fixture(scratch, "viewport-mobile.html");
  const run = await runCli("snap", ["--file", file, "--viewport", "320x740", "--mobile", "--eval", DEVICE_EVAL, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(run).toExitWith(EXIT.clean);
  expect(run.stdout).toContain('"coarse": true');
  expect(deviceReceipt(run.stdout)).toBe("coarse:dpr3:320x740");
});

test("#1668 THE OTHER DIRECTION — a bare --viewport is still a DESKTOP: fine pointer, DPR 1, no touch", async ({ runCli, scratch }) => {
  // Without this arm the fix above is satisfied by making every narrow viewport coarse, which would be a
  // second lie in the opposite direction (and would silently re-write every desktop-narrow measurement).
  const file = await fixture(scratch, "bare-viewport.html");
  const run = await runCli("snap", ["--file", file, "--viewport", "320x740", "--eval", DEVICE_EVAL, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(run).toExitWith(EXIT.clean);
  expect(run.stdout).toContain('"coarse": false');
  expect(run.stdout).toContain('"dpr": 1');
  expect(run.stdout).toContain('"touch": false');
  expect(run.stdout).toContain('"iphone": false');
  expect(deviceReceipt(run.stdout)).toBe("fine:dpr1:320x740");
});

test("#1668 — --mobile alone is unchanged, and --desktop after --mobile still means DESKTOP", async ({ runCli, scratch }) => {
  // The device presets are not size overrides: `--desktop`/`--wide` mean "be a desktop at this size" and
  // must still clear the device, or `--mobile --desktop` would keep touch at 1280 wide.
  const file = await fixture(scratch, "presets.html");
  const mobile = await runCli("snap", ["--file", file, "--mobile", "--eval", DEVICE_EVAL, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(mobile).toExitWith(EXIT.clean);
  expect(mobile.stdout).toContain('"coarse": true');
  expect(deviceReceipt(mobile.stdout)).toMatch(/^coarse:dpr3:430x\d+$/u);

  const desktop = await runCli("snap", ["--file", file, "--mobile", "--desktop", "--eval", DEVICE_EVAL, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(desktop).toExitWith(EXIT.clean);
  expect(desktop.stdout).toContain('"coarse": false');
  expect(deviceReceipt(desktop.stdout)).toBe("fine:dpr1:1280x800");
});
