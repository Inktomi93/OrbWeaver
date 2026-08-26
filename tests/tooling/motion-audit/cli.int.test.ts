// @instrument-proof: a fixture page whose __orb bridge reports a PLANTED breaching snapshot (a 200ms
// blocking LoAF with style/layout in-frame, plus non-virtualized CLS 0.5) must exit 1 through the real
// cli; the in-budget twin must exit 0 — the budget arms cannot pass vacuously on a page whose bridge
// reports nothing. The plant sits at the instrument's INPUT CONTRACT (__orb is app-only; a static page
// has none), which is exactly the mustFlag discipline extended to the cli tier.
//
// ZERO HYGIENE (#409): the twin is only a proof if its denominators are REAL, so every budget fixture
// here composites a compositor-only animation and the clean arm asserts a NONZERO frame population.
// The two absent-evidence arms — no __orb bridge, no composited frame — must exit 2 (instrument error),
// never a clean 0%.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../support/tool-fixtures.ts";

const CLI_TIMEOUT_MS = 90_000;
// 1000ms of a 60fps compositor animation measured 60 frames (probe, 2026-08-21) — a real denominator
// with headroom: the 5% budget then absorbs the odd stray drop a loaded headless host produces (a 300ms
// window gave 18 frames, where ONE stray drop is 5.56% and reds the clean twin).
const FRAME_WINDOW_MS = "1000";
// The measured-click arm waits out the probe's own 5s actionability timeout — past vitest's default.
const SLOW_TEST_MS = 30_000;

/** A compositor-only spinner: the fixture's own frame population, so the budget arms judge real evidence. */
const ANIMATION = `<style>
@keyframes orb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
#spin { width: 40px; height: 40px; background: #888; animation: orb-spin 1s linear infinite; will-change: transform; }
</style>`;

/** A minimal __orb bridge whose motion() answers with the given snapshot. */
function page(
  motionJson: string,
  opts: { animated?: boolean; resetThrows?: boolean; settleThrows?: boolean; missingReset?: boolean; missingSettle?: boolean } = {},
): string {
  const animated = opts.animated ?? true;
  const resetEvidence =
    opts.missingReset === true ? "" : `resetEvidence: ${opts.resetThrows === true ? '() => { throw new Error("planted reset failure"); }' : "() => {}"},`;
  const motionFlaggersSettled =
    opts.missingSettle === true
      ? ""
      : `motionFlaggersSettled: ${opts.settleThrows === true ? '() => { throw new Error("planted settle failure"); }' : "() => true"},`;
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title>${animated ? ANIMATION : ""}<script>
globalThis.__orb = {
  motion: () => (${motionJson}),
  animations: () => [],
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
const FRAME_LINE_RE = /frames {6}raw \d+\/(\d+) dropped/u;

function args(scratch: string, file: string, extra: readonly string[] = []): string[] {
  return [`/${file}`, "--base", `file://${scratch}`, "--window", FRAME_WINDOW_MS, "--no-throttle", ...extra];
}

test("a planted breaching motion snapshot REDs the audit through the real cli", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "jank.html"), page(BREACHING));
  const res = await runCli("motion-audit", args(scratch, "jank.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("FAIL");
  await expect(res).toExitWith(1);
});

test("the in-budget twin passes on a REAL frame population — the red above is the plant, not the harness", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "smooth.html"), page(CLEAN));
  const res = await runCli("motion-audit", args(scratch, "smooth.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("PASS");
  await expect(res).toExitWith(0);
  // The denominator is the whole point: a 0% over an EMPTY population is absent evidence, not smoothness.
  const denominator = FRAME_LINE_RE.exec(res.stdout)?.[1];
  expect(Number(denominator)).toBeGreaterThan(0);
});

// @instrument-absence-proof: the __orb bridge REMOVED (the apparatus absent) and, below, a measured window
// that composited NO frame (the population empty) — both must say INSTRUMENT ERROR, never verdict=PASS.
test("a page with no __orb bridge is an INSTRUMENT ERROR, never a clean audit", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "bridgeless.html"), NO_BRIDGE);
  const res = await runCli("motion-audit", args(scratch, "bridgeless.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("__orb");
  expect(res.stdout).not.toContain("verdict=PASS");
  await expect(res).toExitWith(2);
});

test("a measured window that composited NO frame is an INSTRUMENT ERROR, never 0% dropped", async ({ runCli, scratch }) => {
  // No animation ⇒ an idle page composites nothing inside the window, so the frame population is empty.
  await writeFile(join(scratch, "still.html"), page(CLEAN, { animated: false }));
  const res = await runCli("motion-audit", args(scratch, "still.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("frame population");
  expect(res.stdout).not.toContain("verdict=PASS");
  await expect(res).toExitWith(2);
});

test(
  "a failed pre-measurement reset is an INSTRUMENT ERROR, never a verdict over stale reach evidence",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "reset-fails.html"), page(CLEAN, { resetThrows: true }));
    const res = await runCli("motion-audit", args(scratch, "reset-fails.html", ["--selector", "main"]), { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("INSTRUMENT ERROR");
    expect(res.stdout).toContain("pre-measurement evidence reset");
    expect(res.stdout).not.toContain("verdict=PASS");
    await expect(res).toExitWith(2);
  },
  SLOW_TEST_MS,
);

test("a failed post-reach reset is an INSTRUMENT ERROR, never a verdict over reach evidence", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "reach-reset-fails.html"), page(CLEAN, { resetThrows: true }));
  const res = await runCli("motion-audit", args(scratch, "reach-reset-fails.html", ["--click", "main"]), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("post-reach evidence reset");
  expect(res.stdout).not.toContain("verdict=PASS");
  await expect(res).toExitWith(2);
});

test("a failed motion-flagger settle barrier is an INSTRUMENT ERROR", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "flagger-settle-fails.html"), page(CLEAN, { settleThrows: true }));
  const res = await runCli("motion-audit", args(scratch, "flagger-settle-fails.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("motion flagger settle barrier");
  expect(res.stdout).not.toContain("verdict=PASS");
  await expect(res).toExitWith(2);
});

test("missing reset and settle methods are INSTRUMENT ERROR instead of optional-chain clean", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "missing-reset.html"), page(CLEAN, { missingReset: true }));
  const reach = await runCli("motion-audit", args(scratch, "missing-reset.html", ["--click", "main"]), { timeoutMs: CLI_TIMEOUT_MS });
  expect(reach.stdout).toContain("post-reach evidence reset");
  await expect(reach).toExitWith(2);

  await writeFile(join(scratch, "missing-settle.html"), page(CLEAN, { missingSettle: true }));
  const settleResult = await runCli("motion-audit", args(scratch, "missing-settle.html"), { timeoutMs: CLI_TIMEOUT_MS });
  expect(settleResult.stdout).toContain("motion flagger settle barrier");
  await expect(settleResult).toExitWith(2);
});

test(
  "an unreachable --selector fails LOUDLY and names itself in the machine line",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "target.html"), page(CLEAN));
    const res = await runCli("motion-audit", args(scratch, "target.html", ["--selector", "[data-slot=nope]"]), { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("STEP FAILED");
    expect(res.stdout).toContain("step-failed=1");
    await expect(res).toExitWith(1);
  },
  SLOW_TEST_MS,
);

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("motion-audit", ["--open-caht", "latest"]);
  await expect(res).toExitWith(3);
});
