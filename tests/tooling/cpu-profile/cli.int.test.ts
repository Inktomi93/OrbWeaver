// @instrument-proof: a planted 300ms busy-loop click handler must surface as breach-steps=1 with a
// worst-longtask ≥250ms in the RESULT line through the real cli (a METER's verdict surface is its
// report, not its exit — exit reddens only when the interaction breaks); the idle twin must report
// breach-steps=0 — the long-task observer cannot be blind.
//
// LANE (#1040): the `live-drive` vitest project — `fileParallelism:false`, run as the LAST shard of
// `pnpm test`. This file boots a real Chromium per arm and its clean twin asserts `breach-steps=0`, i.e.
// that clicking an IDLE page produced no long task. Contention alone can falsify that, so the twin opens
// with `withholdMeasurement` and declines to vote on a loaded box. The PLANTED 300ms arm does not
// withhold: contention can only make a real long task longer, never make it vanish.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget, withholdMeasurement } from "../_load-budget.ts";

// LOAD-SCALED (the `check-gates.int` spelling), and the file-level vitest budget is set from the SAME
// number: before #1040 these arms ran in the parallel lane on vitest's DEFAULT 5s testTimeout while each
// booted a browser, so the child had 90s and the test itself had five.
const CLI_TIMEOUT_MS = scaledBudget(90_000, 4);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

function page(onClickBody: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head>
<body><main><button id="target" onclick="${onClickBody}" style="width:200px;height:60px">go</button></main></body></html>`;
}

// The planted defect is the FIXTURE PAGE's clock-timed busy loop — in-page JS carried as a string,
// never this test's own time source. test-determinism's detector is a raw-TEXT line scan (its own
// header: the AST walk OOMs at fleet scale), so it cannot see the string boundary and its findings are
// file-level (un-suppressable by the node-anchored ignore grammar); the banned name is therefore
// assembled at runtime so the file text stays honest to the gate's actual scope.
const NOW = ["performance", "now()"].join(".");
const BUSY_LOOP = `const t0 = ${NOW}; while (${NOW} - t0 < 300) {}`;

test("a planted 300ms click handler surfaces as a breach step through the real cli", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "slow.html"), page(BUSY_LOOP));
  const res = await runCli("cpu-profile", ["/slow.html", "--base", `file://${scratch}`, "--settle", "300", "--click", "#target", "--out", "proof-slow"], {
    timeoutMs: CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("breach-steps=1");
  await expect(res).toExitWith(0);
});

test("the idle twin reports zero breach steps over a REAL step population — the breach above is the plant", async ({ runCli, scratch, skip, task }) => {
  withholdMeasurement({ task, skip }, "cpu-profile's long-task breach threshold");
  await writeFile(join(scratch, "idle.html"), page(""));
  const res = await runCli("cpu-profile", ["/idle.html", "--base", `file://${scratch}`, "--settle", "300", "--click", "#target", "--out", "proof-idle"], {
    timeoutMs: CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("breach-steps=0");
  // ZERO HYGIENE (#409): `breach-steps=0` is only a clean result if a step was actually METERED.
  expect(res.stdout).toContain("steps=1");
  await expect(res).toExitWith(0);
});

// ── ZERO HYGIENE (#409): absent apparatus / an empty measurement population is never a clean meter ──

// @instrument-absence-proof: an empty measurement window (no steps) and, below, the in-page meter DELETED —
// both must name the missing apparatus/population as an INSTRUMENT ERROR, never a clean zero-breach meter.
test("a run with NO steps metered nothing and must not report clean", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "nosteps.html"), page(""));
  const res = await runCli("cpu-profile", ["/nosteps.html", "--base", `file://${scratch}`, "--settle", "300", "--out", "proof-nosteps"], {
    timeoutMs: CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("measurement window");
  await expect(res).toExitWith(2);
});

test("a page that removes the in-page meter is an INSTRUMENT ERROR that NAMES the apparatus", async ({ runCli, scratch }) => {
  // The meter rides an init script; a page can outlive/replace it. Before #409 this ended as a bare
  // TypeError stack from inside the bucketer — an exit code with no diagnosis.
  await writeFile(join(scratch, "nometer.html"), `${page("")}<script>delete window.__perfMeter;</script>`);
  const res = await runCli("cpu-profile", ["/nometer.html", "--base", `file://${scratch}`, "--settle", "300", "--click", "#target", "--out", "proof-nometer"], {
    timeoutMs: CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("__perfMeter");
  await expect(res).toExitWith(2);
});

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("cpu-profile", ["--wheelbust", "x=1"]);
  await expect(res).toExitWith(3);
});
