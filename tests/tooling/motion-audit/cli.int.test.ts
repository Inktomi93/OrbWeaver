// @instrument-proof: a fixture page whose __orb bridge reports a PLANTED breaching snapshot (a 200ms
// blocking LoAF with style/layout in-frame, plus non-virtualized CLS 0.5) must exit 1 through the real
// cli; the in-budget twin must exit 0 — the budget arms cannot pass vacuously on a page whose bridge
// reports nothing. The plant sits at the instrument's INPUT CONTRACT (__orb is app-only; a static page
// has none), which is exactly the mustFlag discipline extended to the cli tier.
//
// ZERO HYGIENE (#409): the twin is only a proof if its denominators are REAL, so every budget fixture
// here composites a compositor-only animation and the clean arm asserts a NONZERO frame population.
// Missing bridge evidence must exit 2. The deterministic zero/one-frame refusal is planted at the pure
// verdict seam; the real-browser tiny-window control below proves any incidental 2+ frame population is
// still labeled collapsed/unjudged rather than promoted to a frame-rate verdict.
//
// LANE (#1040): this file lives in the `live-drive` vitest project — `fileParallelism:false`, run as the
// LAST shard of `pnpm test`, on the quietest box the battery can offer. It is here because its PASS arms
// are MEASUREMENTS: the budget the cli gates is `frames.budgeted.pct > DROPPED_FRAME_BUDGET_PCT`
// (lib/verdicts.ts), and that percentage read 47.54%, then 10%, then clean on IDENTICAL source as the box
// quieted. So the arms below that expect PASS/exit 0 open with `withholdMeasurement`: on a contended box
// they SKIP with a reason instead of voting. The FAIL and INSTRUMENT-ERROR arms do NOT withhold — extra
// contention can only add reasons to red, never turn a planted breach green, so they stay honest under
// load and this file's coverage does not evaporate the moment a sibling lane starts.
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget, withholdMeasurement } from "../_load-budget.ts";

// LOAD-SCALED, not fixed (the `check-gates.int` / `gate-conformance.int` spelling): a real browser boot +
// drive costs what the box lets it cost, and a fixed ceiling turns a slow drive into an opaque timeout
// that reads exactly like an assertion red. Cap 4 matches the other heavy tooling suites.
const CLI_TIMEOUT_MS = scaledBudget(90_000, 4);
// The file default covers ONE drive; the two-drive arms below carry an explicit `2 * CLI_TIMEOUT_MS`.
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });
// 1000ms of a 60fps compositor animation measured 60 frames (probe, 2026-08-21) — a real denominator
// with headroom: the 5% budget then absorbs the odd stray drop a loaded headless host produces (a 300ms
// window gave 18 frames, where ONE stray drop is 5.56% and reds the clean twin).
const FRAME_WINDOW_MS = "1000";

/** A compositor-only spinner: the fixture's own frame population, so the budget arms judge real evidence. */
const ANIMATION = `<style>
@keyframes orb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
#spin { width: 40px; height: 40px; background: #888; animation: orb-spin 1s linear infinite; will-change: transform; }
</style>`;

/** A minimal __orb bridge whose motion() answers with the given snapshot. */
function page(
  motionJson: string,
  opts: {
    animated?: boolean;
    resetThrows?: boolean;
    settleThrows?: boolean;
    missingReset?: boolean;
    missingSettle?: boolean;
    expectedReducedMotion?: boolean;
    runtimeEnvironmentMismatch?: boolean;
    /** Literal JS for `flags()`'s return; default is an empty ring. */
    flagsJson?: string;
    /** OMIT the `flags` member entirely — the #1070 blindness, which must refuse rather than read empty. */
    missingFlags?: boolean;
  } = {},
): string {
  const animated = opts.animated ?? true;
  const flags = opts.missingFlags === true ? "" : `flags: () => (${opts.flagsJson ?? "[]"}),`;
  const resetEvidence =
    opts.missingReset === true ? "" : `resetEvidence: ${opts.resetThrows === true ? '() => { throw new Error("planted reset failure"); }' : "() => {}"},`;
  const motionFlaggersSettled =
    opts.missingSettle === true
      ? ""
      : `motionFlaggersSettled: ${opts.settleThrows === true ? '() => { throw new Error("planted settle failure"); }' : "() => true"},`;
  const reducedMotionProof =
    opts.expectedReducedMotion === undefined
      ? ""
      : `const boot=JSON.parse(localStorage.getItem("orb:appearance-boot")??"null");
if(boot?.state?.reducedMotion!==${String(opts.expectedReducedMotion)}) throw new Error("appearance reducedMotion arm did not reach the page");`;
  const environmentMismatch =
    opts.runtimeEnvironmentMismatch === true
      ? `const nativeMatchMedia=window.matchMedia.bind(window);
window.matchMedia=(query)=>{
  if(query==="(pointer: coarse)"||query==="(hover: none)") return {matches:false,media:query};
  if(query==="(pointer: fine)"||query==="(hover: hover)") return {matches:true,media:query};
  return nativeMatchMedia(query);
};
Object.defineProperty(navigator,"maxTouchPoints",{configurable:true,get:()=>0});`
      : "";
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title>${animated ? ANIMATION : ""}<script>
${reducedMotionProof}
${environmentMismatch}
globalThis.__orb = {
  motion: () => (${motionJson}),
  animations: () => (${animated ? '[{ target: "#spin", properties: ["transform"], compositorClean: true }]' : "[]"}),
  consoleErrors: () => ({ records: [], dropped: 0, cap: 128 }),
  ${flags}
  ${resetEvidence}
  ${motionFlaggersSettled}
  setMotionAuditDropTrackingPaused: () => {},
};
</script></head><body><main>fixture${animated ? '<div id="spin"></div>' : ""}</main></body></html>`;
}

/** The same page WITHOUT the bridge — the instrument's input contract, absent. */
const NO_BRIDGE = `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title>${ANIMATION}</head><body><main>no bridge<div id="spin"></div></main></body></html>`;

const BREACHING = `{
  loafs: [{ startTime: 100, duration: 260, blockingDuration: 200, styleAndLayoutStart: 120, scripts: [] }],
  cls: 0.5, virtualizedCls: 0, nonVirtualizedCls: 0.5, worstBlocking: 200, worstShift: 0.5
}`;
const CLEAN = "{ loafs: [], cls: 0, virtualizedCls: 0, nonVirtualizedCls: 0, worstBlocking: 0, worstShift: 0 }";
/** The report's frame line — group 1 is the DENOMINATOR (the population the % is taken over). */
const FRAME_LINE_RE = /frames\s+raw \d+\/(\d+)/u;

// #1070 — one `anim` raise carrying the launch record of a dirty transition that is OVER by the time the
// end-of-window `animations()` sample runs. `animations()` in every fixture above reports only the
// compositor-clean spinner, so this is a population the sampler structurally cannot contain.
const TRANSIENT_DIRTY_FLAG = `[{ tag: "anim", at: 40, offender: "#spin", detail: "animating non-compositor width", overBudget: true,
  animation: { target: "#spin", properties: ["width"], compositorClean: false, attribution: { owner: "application", mechanism: "css-transition" } } }]`;
// The same raise, but the ratified Base UI height lifecycle the #953 allowance sanctions. The flag still
// says overBudget:true — motion-audit re-judges the FACTS, so this one must not red.
const TRANSIENT_RATIFIED_FLAG = `[{ tag: "anim", at: 40, offender: "[data-slot=collapsible-panel]", detail: "animating non-compositor height", overBudget: true,
  animation: { target: "[data-slot=collapsible-panel]", properties: ["height"], compositorClean: false,
    targetState: { startingStyle: false, endingStyle: false },
    lifecycleState: { startingStyle: true, endingStyle: false, observedAt: "transition-run" },
    attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" } } }]`;

function args(scratch: string, file: string, extra: readonly string[] = []): string[] {
  const translated: string[] = [];
  let hasMotion = false;
  let index = 0;
  while (index < extra.length) {
    const token = extra[index];
    if (token === "--selector") {
      translated.push("--motion", extra[index + 1] ?? "");
      hasMotion = true;
      index += 2;
    } else {
      translated.push(token ?? "");
      index += 1;
    }
  }
  if (!hasMotion) {
    translated.push("--motion");
  }
  return [
    `/${file}`,
    "--base",
    `file://${scratch}`,
    "--motion-window",
    FRAME_WINDOW_MS,
    "--motion-no-throttle",
    ...translated,
    "--no-shot",
    "--no-deadcss",
    "--no-failure-evidence",
  ];
}

test("a planted breaching motion snapshot REDs the audit through the real cli", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "jank.html"), page(BREACHING));
  const res = await runCli("snap", args(scratch, "jank.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("FAIL");
  await expect(res).toExitWith(1);
});

test("the in-budget twin passes on a REAL frame population — the red above is the plant, not the harness", async ({ runCli, scratch, skip, task }) => {
  withholdMeasurement({ task, skip }, "motion-audit's dropped-frame budget");
  await writeFile(join(scratch, "smooth.html"), page(CLEAN));
  const res = await runCli("snap", args(scratch, "smooth.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("PASS");
  await expect(res).toExitWith(0);
  // The denominator is the whole point: a 0% over an EMPTY population is absent evidence, not smoothness.
  const denominator = FRAME_LINE_RE.exec(res.stdout)?.[1];
  expect(Number(denominator)).toBeGreaterThan(0);
});

function resultValue(stdout: string, key: string): string {
  const prefix = `${key}=`;
  const token = stdout.split(/\s+/u).find((entry) => entry.startsWith(prefix));
  expect(token, `missing ${key} in:\n${stdout}`).toBeTypeOf("string");
  return String(token).slice(prefix.length);
}

async function expectMobileEnvironment(stdout: string): Promise<void> {
  const artifact = JSON.parse(await readFile(resultValue(stdout, "motion-artifact"), "utf8")) as {
    readonly data: {
      readonly environment: {
        readonly requested: { readonly device: string; readonly viewport: { readonly width: number; readonly height: number } };
        readonly actual: {
          readonly device: { readonly kind: "named"; readonly name: string } | { readonly kind: "desktop" | "unmatched" };
          readonly viewport: { readonly width: number; readonly height: number };
          readonly pointer: string;
          readonly hover: string;
          readonly maxTouchPoints: number;
          readonly deviceScaleFactor: number;
          readonly isMobile: boolean;
        };
        readonly mismatches: readonly string[];
      };
      readonly animations: readonly unknown[];
    };
  };
  expect(artifact.data.environment.requested).toMatchObject({ device: "iPhone 14 Pro Max", viewport: { width: 430, height: 740 } });
  expect(artifact.data.environment.actual).toMatchObject({
    device: { kind: "named", name: "iPhone 14 Pro Max" },
    viewport: { width: 430, height: 740 },
    pointer: "coarse",
    hover: "none",
    maxTouchPoints: 1,
    deviceScaleFactor: 3,
    isMobile: true,
  });
  expect(artifact.data.environment.mismatches).toEqual([]);
  expect(artifact.data.animations.length).toBeGreaterThan(0);
  expect(stdout).toContain("motion-window-ms=1000");
  expect(Number(FRAME_LINE_RE.exec(stdout)?.[1])).toBeGreaterThan(0);
}

test("mobile normal-motion and reduced-motion arms retain real subjects, windows, frames, and coarse/touch evidence", {
  timeout: 2 * CLI_TIMEOUT_MS,
}, async ({ runCli, scratch, skip, task }) => {
  // Both arms expect exit 0, i.e. EVERY budget in range — the dropped-frame percentage included.
  withholdMeasurement({ task, skip }, "motion-audit's mobile dropped-frame budget");
  await writeFile(join(scratch, "mobile-normal.html"), page(CLEAN, { expectedReducedMotion: false }));
  const normal = await runCli("snap", args(scratch, "mobile-normal.html", ["--mobile", "--full-motion"]), { timeoutMs: CLI_TIMEOUT_MS });
  await expectMobileEnvironment(normal.stdout);
  await expect(normal).toExitWith(0);

  await writeFile(join(scratch, "mobile-reduced.html"), page(CLEAN, { expectedReducedMotion: true }));
  const reduced = await runCli("snap", args(scratch, "mobile-reduced.html", ["--mobile", "--appearance", '{"reducedMotion":true}']), {
    timeoutMs: CLI_TIMEOUT_MS,
  });
  await expectMobileEnvironment(reduced.stdout);
  await expect(reduced).toExitWith(0);
});

test("a viewport-matched fake mobile runtime is INSTRUMENT ERROR while the same-request descriptor twin passes", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "mobile-runtime-fake.html"), page(CLEAN, { expectedReducedMotion: false, runtimeEnvironmentMismatch: true }));
  const planted = await runCli("snap", args(scratch, "mobile-runtime-fake.html", ["--mobile", "--full-motion"]), { timeoutMs: CLI_TIMEOUT_MS });
  expect(planted.stdout).toContain("INSTRUMENT ERROR");
  expect(planted.stdout).toContain("the requested browser environment");
  expect(planted.stdout).toContain("pointer expected coarse but observed fine");
  expect(Number(FRAME_LINE_RE.exec(planted.stdout)?.[1])).toBeGreaterThan(0);
  await expect(planted).toExitWith(2);
});

// @instrument-absence-proof: the __orb bridge REMOVED must say INSTRUMENT ERROR, never verdict=PASS.
test("a page with no __orb bridge is an INSTRUMENT ERROR, never a clean audit", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "bridgeless.html"), NO_BRIDGE);
  const res = await runCli("snap", args(scratch, "bridgeless.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("__orb");
  expect(res.stdout).not.toContain("motion=PASS");
  await expect(res).toExitWith(2);
});

test("a tiny idle window never promotes an absent or collapsed frame population to a judged rate", async ({ runCli, scratch }) => {
  // Chrome may emit 0/1 frames (a hard gap) or incidental compositor bookkeeping frames around a 1ms
  // trace. The browser control therefore asserts the invariant that survives both legitimate outcomes;
  // exact zero/one refusal boundaries are planted deterministically in index.test.ts.
  await writeFile(join(scratch, "still.html"), page(CLEAN, { animated: false }));
  const res = await runCli("snap", args(scratch, "still.html", ["--motion-window", "1"]), { timeoutMs: CLI_TIMEOUT_MS });
  const frames = Number(resultValue(res.stdout, "frames-raw").split("/")[1]);
  expect(frames).toBeLessThan(20);
  expect(resultValue(res.stdout, "frames-budget")).toBe("unjudged");
  const uncomputable = frames < 2;
  expect(resultValue(res.stdout, "frames-population-raw")).toBe(uncomputable ? "uncomputable" : "collapsed");
  expect(res.stdout.includes("INSTRUMENT ERROR")).toBe(uncomputable);
  expect(res.stdout.includes("frame population")).toBe(uncomputable);
  expect(res.stdout.includes("motion=PASS")).toBe(!uncomputable);
  await expect(res).toExitWith(uncomputable ? 2 : 0);
});

test("a failed pre-measurement reset is an INSTRUMENT ERROR, never a verdict over stale reach evidence", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "reset-fails.html"), page(CLEAN, { resetThrows: true }));
  const res = await runCli("snap", args(scratch, "reset-fails.html", ["--selector", "main"]), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("pre-measurement evidence reset");
  expect(res.stdout).not.toContain("motion=PASS");
  await expect(res).toExitWith(2);
});

test("a failed post-reach reset is an INSTRUMENT ERROR, never a verdict over reach evidence", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "reach-reset-fails.html"), page(CLEAN, { resetThrows: true }));
  const res = await runCli("snap", args(scratch, "reach-reset-fails.html", ["--click", "main"]), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("post-reach evidence reset");
  expect(res.stdout).not.toContain("motion=PASS");
  await expect(res).toExitWith(2);
});

test("a failed motion-flagger settle barrier is an INSTRUMENT ERROR", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "flagger-settle-fails.html"), page(CLEAN, { settleThrows: true }));
  const res = await runCli("snap", args(scratch, "flagger-settle-fails.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("motion flagger settle barrier");
  expect(res.stdout).not.toContain("motion=PASS");
  await expect(res).toExitWith(2);
});

test("missing reset and settle methods are INSTRUMENT ERROR instead of optional-chain clean", { timeout: 2 * CLI_TIMEOUT_MS }, async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "missing-reset.html"), page(CLEAN, { missingReset: true }));
  const reach = await runCli("snap", args(scratch, "missing-reset.html", ["--click", "main"]), { timeoutMs: CLI_TIMEOUT_MS });
  expect(reach.stdout).toContain("post-reach evidence reset");
  await expect(reach).toExitWith(2);

  await writeFile(join(scratch, "missing-settle.html"), page(CLEAN, { missingSettle: true }));
  const settleResult = await runCli("snap", args(scratch, "missing-settle.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(settleResult.stdout).toContain("motion flagger settle barrier");
  await expect(settleResult).toExitWith(2);
});

test("an unreachable --selector fails LOUDLY and names itself in the machine line", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "target.html"), page(CLEAN));
  const res = await runCli("snap", args(scratch, "target.html", ["--selector", "[data-slot=nope]"]), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("STEP FAILED");
  expect(res.stdout).toContain("steps-failed=1");
  await expect(res).toExitWith(1);
});

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("snap", ["--motion", "--open-caht", "latest"]);
  await expect(res).toExitWith(3);
});

// @instrument-proof (#1070): the TRANSIENT half of the dirty-animation budget, at the cli tier. The
// end-of-window `animations()` sample in these fixtures reports only the compositor-clean spinner, so a
// red here can ONLY have come from the flag ring — which is exactly the population the sampler cannot
// see (every house duration is 130–360ms; the window is 1s+). Two directions, plus the refusal arm.
test("a dirty transition visible ONLY in the flag ring REDs the audit through the real cli", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "transient-jank.html"), page(CLEAN, { flagsJson: TRANSIENT_DIRTY_FLAG }));
  const res = await runCli("snap", args(scratch, "transient-jank.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("transient-dirty-animations=1");
  expect(res.stdout).toContain("dirty-animations-budgeted=1");
  expect(res.stdout).toContain("FAIL");
  await expect(res).toExitWith(1);
});

test("the ratified Base UI height lifecycle in the flag ring PASSES — the console verdict is not imported", async ({ runCli, scratch, skip, task }) => {
  // The #953 allowance is what this arm is about, but the run still has to clear every OTHER budget to
  // reach PASS — so a loaded box could red it for a reason that has nothing to do with the allowance.
  withholdMeasurement({ task, skip }, "motion-audit's dropped-frame budget");
  // The twin that proves the red above is the plant, not the mechanism: identical shape, `overBudget:true`
  // on the flag, and the #953 allowance still takes it out of the budget because motion-audit re-judges.
  await writeFile(join(scratch, "transient-ratified.html"), page(CLEAN, { flagsJson: TRANSIENT_RATIFIED_FLAG }));
  const res = await runCli("snap", args(scratch, "transient-ratified.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("transient-dirty-animations=1");
  expect(res.stdout).toContain("library-height-animations=1");
  expect(res.stdout).toContain("dirty-animations-budgeted=0");
  expect(res.stdout).toContain("PASS");
  await expect(res).toExitWith(0);
});

test("a bridge with NO flags() member is an INSTRUMENT ERROR, never an empty transient population", async ({ runCli, scratch }) => {
  // The blindness itself, refused loudly instead of read as "nothing fired" — the difference between an
  // unobservable population and an empty one is the whole #1070 finding.
  await writeFile(join(scratch, "no-flags.html"), page(CLEAN, { missingFlags: true }));
  const res = await runCli("snap", args(scratch, "no-flags.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("motion-flag ring");
  expect(res.stdout).toContain("anim-flags=absent");
  expect(res.stdout).not.toContain("motion=PASS");
  await expect(res).toExitWith(2);
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
  const res = await runCli("snap", ["/", "--base", STAGE_BAND_SERVER_BASE, "--motion", "--motion-window", "200", "--no-shot"], {
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
  const res = await runCli("snap", ["/", "--base", STAGE_BAND_SERVER_BASE, "--motion", "--motion-window", "200", "--no-shot"], {
    cwd: dir,
    timeoutMs: CLI_TIMEOUT_MS,
  });
  // The guard is SILENT: whatever this run then reports, it is not a band-ownership refusal. (Nothing
  // serves that port for a disposable checkout, so the run still fails — on its own nav/meter terms.)
  expect(res.stdout + res.stderr).not.toContain("is the isolated-stage band");
});
