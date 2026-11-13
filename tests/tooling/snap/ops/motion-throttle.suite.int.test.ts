// A --cpu-throttle run keeps its rate after a --motion window, in a real browser through the snap CLI. Chrome
// drops a CPU rate when the CDP session that set it detaches, which a recording stand-in cannot see; the
// bracket's send order is tests/tooling/snap/ops/arms/motion.test.ts.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { BOX_LOAD_ENV } from "@orb/tooling/floor/host/load-budget";
import { beforeEach, vi } from "vitest";
import { scaledBudget } from "../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(180_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const QUIET = ["--no-shot", "--no-deadcss", "--no-failure-evidence"];
const SESSION_RATE = "2";
/** The fastest of several fixed loops, in ms: CPU work the throttle scales and nothing else does. The loops are spread
 *  out in time, because a burst of load on a shared box can slow every loop of a back-to-back set, and then the
 *  unthrottled baseline reads as slow as the throttled run. */
const LOOP_MS =
  "async()=>{let best=Infinity;for(let r=0;r<9;r++){const t=performance.now();let x=0;for(let i=0;i<60000000;i++)x+=i;best=Math.min(best,performance.now()-t);await new Promise((done)=>setTimeout(done,40));}return Math.round(best)}";
/** Held rate: after/before near 1. A rate dropped to 1x halves it. */
const HELD_RATIO_FLOOR = 0.75;
/** The positive control: the session rate must visibly slow the loop against an unthrottled run. */
const THROTTLED_RATIO_FLOOR = 1.5;

beforeEach(() => {
  vi.stubEnv(BOX_LOAD_ENV, "0.2/24");
});

const FIXTURE = `<!doctype html>
<html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>motion throttle</title>
<script>
globalThis.__orb={ snap:()=>({fixture:true}), flags:()=>[], resetEvidence:()=>{},
  consoleErrors:()=>({records:[],dropped:0,cap:128}),
  motion:()=>({loafs:[],cls:0,virtualizedCls:0,nonVirtualizedCls:0,observedCls:0,observedVirtualizedCls:0,
    observedNonVirtualizedCls:0,worstBlocking:0,worstShift:0}),
  animations:()=>[], motionFlaggersSettled:()=>true, setMotionAuditDropTrackingPaused:()=>{} };
</script></head><body><main><button id="target">target</button></main></body></html>`;

/** The `--eval` values in argv order: each `--- EVAL[n] (...) ---` header is followed by its value line. */
function evalValues(stdout: string): number[] {
  const lines = stdout.split("\n");
  return lines.flatMap((line, index) => (line.startsWith("--- EVAL[") ? [Number(lines[index + 1])] : []));
}

test("a --cpu-throttle run still runs at its rate after the --motion window closes", async ({ runCli, scratch }) => {
  const file = join(scratch, "motion-throttle.html");
  await writeFile(file, FIXTURE);

  const base = await runCli("snap", ["--file", file, "--eval", LOOP_MS, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(base).toExitWith(EXIT.clean);
  const [unthrottled] = evalValues(base.stdout);

  const run = await runCli(
    "snap",
    ["--file", file, "--cpu-throttle", SESSION_RATE, "--eval", LOOP_MS, "--motion", "#target", "--motion-window", "400", "--eval", LOOP_MS, ...QUIET],
    { timeoutMs: CLI_TIMEOUT_MS },
  );
  expect(run.stdout).toContain(`throttle=cpu:${SESSION_RATE}x`);
  const [before, after] = evalValues(run.stdout);
  expect(unthrottled, base.stdout).toBeGreaterThan(0);
  expect(before, run.stdout).toBeGreaterThan(0);

  expect(Number(before) / Number(unthrottled), `before=${String(before)} unthrottled=${String(unthrottled)}`).toBeGreaterThan(THROTTLED_RATIO_FLOOR);
  expect(Number(after) / Number(before), `after=${String(after)} before=${String(before)}`).toBeGreaterThan(HELD_RATIO_FLOOR);
});
