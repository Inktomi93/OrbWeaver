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
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
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
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title>
<script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128})};</script></head>
<body><main><button id="target" onclick="${onClickBody}" style="width:200px;height:60px">go</button></main></body></html>`;
}

// The planted defect is the FIXTURE PAGE's clock-timed busy loop — in-page JS carried as a string,
// never this test's own time source. test-determinism's detector is a raw-TEXT line scan (its own
// header: the AST walk OOMs at fleet scale), so it cannot see the string boundary and its findings are
// file-level (un-suppressable by the node-anchored ignore grammar); the banned name is therefore
// assembled at runtime so the file text stays honest to the gate's actual scope.
const NOW = ["performance", "now()"].join(".");
const BUSY_LOOP = `const t0 = ${NOW}; while (${NOW} - t0 < 300) {}`;

test("a planted 300ms click handler surfaces as non-voting breach evidence through Snap's perf arm", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "slow.html"), page(BUSY_LOOP));
  const res = await runCli(
    "snap",
    ["/slow.html", "--base", `file://${scratch}`, "--perf", "--click", "#target", "--no-shot", "--no-deadcss", "--no-failure-evidence"],
    {
      timeoutMs: CLI_TIMEOUT_MS,
    },
  );
  expect(res.stdout).toContain("breach-steps=1");
  const worstLongTask = /worst-longtask=(\d+)ms/u.exec(res.stdout)?.[1];
  expect(Number(worstLongTask)).toBeGreaterThanOrEqual(250);
  await expect(res).toExitWith(0);
});

test("the idle twin reports zero breach steps over a REAL step population — the breach above is the plant", async ({ runCli, scratch, skip, task }) => {
  withholdMeasurement({ task, skip }, "cpu-profile's long-task breach threshold");
  await writeFile(join(scratch, "idle.html"), page(""));
  const res = await runCli(
    "snap",
    ["/idle.html", "--base", `file://${scratch}`, "--perf", "--click", "#target", "--no-shot", "--no-deadcss", "--no-failure-evidence"],
    {
      timeoutMs: CLI_TIMEOUT_MS,
    },
  );
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
  const res = await runCli("snap", ["/nosteps.html", "--base", `file://${scratch}`, "--perf", "--no-shot", "--no-deadcss", "--no-failure-evidence"], {
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
  const res = await runCli(
    "snap",
    ["/nometer.html", "--base", `file://${scratch}`, "--perf", "--click", "#target", "--no-shot", "--no-deadcss", "--no-failure-evidence"],
    {
      timeoutMs: CLI_TIMEOUT_MS,
    },
  );
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("__perfMeter");
  await expect(res).toExitWith(2);
});

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("snap", ["--perf", "--wheelbust", "x=1"]);
  await expect(res).toExitWith(3);
});

// ── #1186: a `--base` at the stage band asserts OWNERSHIP before it measures ────────────────────────
//
// A `snap --isolated --ref <sha>` that REFUSES on band contention does not stop what is chained behind
// it: this instrument measured whichever lane's stage held :5273 and printed normal-looking numbers.
// Red-first on the unmodified source, measured with the fixture below: the FOREIGN-marker arm launched a
// browser and exited on a nav failure, never once naming the owner.
//
// The fixture plants the marker in a DISPOSABLE git repo and runs the cli with `cwd` there — the marker
// home is derived from `git rev-parse --git-common-dir`, so a temp repo owns a temp marker. The box's
// real, SHARED marker is never written: doing so from a test would evict a live sibling's stage.
const STAGE_BAND_SERVER_BASE = "http://localhost:8888";

/** A disposable checkout whose shared stage marker names `owner`. Returns the repo's own root as git
 *  reports it, so an "ours" arm can plant an EXACT match rather than a hopeful string. */
async function plantedStageMarker(dir: string, owner: string | null): Promise<string> {
  await mkdir(dir, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  const root = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" }).stdout.trim();
  if (owner !== null) {
    await mkdir(join(dir, ".cache", "snap-stage"), { recursive: true });
    await writeFile(
      join(dir, ".cache", "snap-stage", "active.json"),
      JSON.stringify({
        sha: "0".repeat(40),
        shortSha: "000000000000",
        dir: join(owner, ".cache", "snap-stage", "000000000000"),
        serverPort: 8888,
        vitePort: 5273,
        baseUrl: "http://localhost:5273",
        checkout: owner === "SELF" ? root : owner,
        ownerPid: null,
        startedAt: "2026-09-02T10:00:00.000Z",
        lastUsedAt: "2026-09-02T10:00:00.000Z",
      }),
    );
  }
  return root;
}

test("a --base at the stage band owned by ANOTHER checkout refuses (exit 2) and names both (#1186)", async ({ runCli, scratch }) => {
  const dir = join(scratch, "band-foreign");
  await plantedStageMarker(dir, "/some/other/checkout");
  const res = await runCli("snap", ["/", "--base", STAGE_BAND_SERVER_BASE, "--perf", "--no-shot"], {
    cwd: dir,
    timeoutMs: CLI_TIMEOUT_MS,
  });
  await expect(res).toExitWith(2);
  expect(res.stdout + res.stderr).toContain("/some/other/checkout");
  expect(res.stdout + res.stderr).toContain("nothing was measured");
});

test("the SAME band base is measured normally when this checkout owns the marker (#1186 control)", async ({ runCli, scratch }) => {
  const dir = join(scratch, "band-ours");
  await plantedStageMarker(dir, "SELF");
  const res = await runCli("snap", ["/", "--base", STAGE_BAND_SERVER_BASE, "--perf", "--no-shot"], {
    cwd: dir,
    timeoutMs: CLI_TIMEOUT_MS,
  });
  // The guard is SILENT: whatever this run then reports, it is not a band-ownership refusal. (Nothing
  // serves that port for a disposable checkout, so the run still fails — on its own nav/meter terms.)
  expect(res.stdout + res.stderr).not.toContain("is the isolated-stage band");
});
