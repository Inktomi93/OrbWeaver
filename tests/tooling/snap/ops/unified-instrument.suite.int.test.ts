import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult } from "@orb/testkit/tooling";
import { expect, test } from "@orb/testkit/tooling";
import type { MeterData, StepReport } from "@orb/tooling/cpu-profile";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { BOX_LOAD_ENV } from "@orb/tooling/floor/host/load-budget";
import type { AuditData } from "@orb/tooling/motion-audit";
import { beforeEach, vi } from "vitest";
import { buildReports } from "../../../../tooling/src/cpu-profile/ops/report.ts";
import type { TimingCapability } from "../../../../tooling/src/floor/host/timing-capability.ts";
import { animationTotals } from "../../../../tooling/src/motion-audit/lib/animations.ts";
import { clsTotals, loafTotals, observedClsTotals } from "../../../../tooling/src/motion-audit/lib/verdicts.ts";
import { evaluateMotionAudit } from "../../../../tooling/src/motion-audit/ops/report.ts";
import { interactionPerfFact } from "../../../../tooling/src/snap/lib/interaction-perf-verdict.ts";
import {
  INTERACTION_PERF_CLICK_BREACH_MS,
  interactionPerfBreachCount,
  interactionPerfExit,
  interactionPerfProblems,
} from "../../../../tooling/src/snap/ops/arms/interaction-perf.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(180_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const QUIET = ["--no-shot", "--no-deadcss", "--no-failure-evidence"];

// Keep load classification independent of hardware timing qualification. beforeEach survives unstubEnvs.
beforeEach(() => {
  vi.stubEnv(BOX_LOAD_ENV, "0.2/24");
});

function resultValue(stdout: string, key: string): string {
  const prefix = `${key}=`;
  const token = stdout.split(/\s+/u).find((entry) => entry.startsWith(prefix));
  expect(token, `missing ${key} in:\n${stdout}`).toBeTypeOf("string");
  return String(token).slice(prefix.length);
}

function cleanStep(overrides: Partial<StepReport> = {}): StepReport {
  return {
    idx: 0,
    label: "clean",
    longTaskCount: 0,
    longTaskTotalMs: 0,
    longTaskWorstMs: 0,
    worstBlockingMs: null,
    worstScript: null,
    clickDurMs: null,
    clickInputDelayMs: null,
    clickProcessingMs: null,
    worstRafGapMs: 0,
    shiftScore: 0,
    ...overrides,
  };
}

const FIXTURE = `<!doctype html>
<html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>unified instrument</title>
<style>@keyframes spin{to{transform:rotate(1turn)}}#spin{width:20px;height:20px;animation:spin 1s linear infinite}</style>
<script>
globalThis.__orb={
  motion:()=>({loafs:[],cls:0,virtualizedCls:0,nonVirtualizedCls:0,observedCls:0,
    observedVirtualizedCls:0,observedNonVirtualizedCls:0,worstBlocking:0,worstShift:0}),
  animations:()=>[{target:"#spin",properties:["transform"],compositorClean:true}],
  flags:()=>[], resetEvidence:()=>{}, motionFlaggersSettled:()=>true,
  setMotionAuditDropTrackingPaused:()=>{}, snap:()=>({fixture:true}),
  consoleErrors:()=>({records:[],dropped:0,cap:128})
};
</script></head><body><main>
<button id="clean">clean</button>
<button id="target" onclick="{let total=0;for(let i=0;i<5000000;i+=1){total+=Math.sqrt(i)}globalThis.__plant=total}">hot</button>
<div id="spin"></div></main></body></html>`;
// The hot button burns 5M iterations (~0.5s here): an unmistakable long task (>50ms) and click duration
// (>100ms) that stays an order of magnitude under STEP_TIMEOUT_MS (5s). At 50M it ran ~5.8s under moderate
// load and lost the race with the click's own step timeout (2026-09-04 battery; green alone).

const DIRTY_MOTION_FIXTURE = FIXTURE.replace(
  'animations:()=>[{target:"#spin",properties:["transform"],compositorClean:true}],\n  flags:()=>[]',
  'animations:()=>[],\n  flags:()=>[{tag:"anim",at:40,offender:"#spin",detail:"animating non-compositor width",overBudget:true,animation:{target:"#spin",properties:["width"],compositorClean:false,attribution:{owner:"application",mechanism:"css-transition"}}}]',
);

interface AnalyzerProblem {
  readonly arm: string;
  readonly metric: string;
  readonly subject: string;
  readonly observed: string;
  readonly threshold: string;
  readonly detail?: string;
}

interface PerfArtifact {
  readonly contract: string;
  readonly cycles: number;
  readonly raw: readonly MeterData[];
  readonly reports: readonly StepReport[];
  readonly gaps: readonly unknown[];
  readonly withheld: string | null;
  readonly problems: readonly AnalyzerProblem[];
  readonly timingPolicy: TimingCapability["policy"];
}

interface PerfIndex {
  readonly verdict: { readonly state: string; readonly arms: readonly { readonly arm: string; readonly state: string }[] };
  readonly artifacts: readonly {
    readonly producerArm: string | null;
    readonly channel: string;
    readonly completeness: string;
    readonly records: number | null;
  }[];
}

async function assertWithheldPerf(perf: CliResult, artifact: PerfArtifact, index: PerfIndex, report: CliResult): Promise<void> {
  await expect(perf).toExitWith(EXIT.toolError);
  expect(perf.stdout).toContain(`WITHHELD (${artifact.withheld})`);
  expect(perf.stdout).toContain("perf=withheld");
  expect(artifact.problems).toContainEqual(
    expect.objectContaining({
      arm: "interaction-perf",
      kind: "evidence-gap",
      metric: "rate-verdict",
      observed: "withheld",
      threshold: "measured",
      detail: artifact.withheld,
    }),
  );
  expect(index.verdict.state).toBe("refused");
  expect(index.verdict.arms.find((row) => row.arm === "interaction-perf")?.state).toBe("withheld");
  expect(report.stdout).toContain("ARM          interaction-perf state=withheld");
  expect(report.stdout).toMatch(/FINDING\s+error \| rate-verdict: withheld \(threshold measured\) \| interaction tape/u);
  expect(report.stdout).not.toMatch(/^PROBLEM\s+arm=interaction-perf/gmu);
  expect(report.stdout).not.toContain("ARM          interaction-perf state=failed");
  expect(report.stdout).not.toContain("VERDICT      failed");
}

async function assertMeasuredPerf(perf: CliResult, artifact: PerfArtifact, index: PerfIndex, report: CliResult): Promise<void> {
  await expect(perf).toExitWith(EXIT.clean);
  expect(artifact.withheld).toBeNull();
  const clean = artifact.reports.filter((row) => row.label === "click #clean");
  const hot = artifact.reports.filter((row) => row.label === "click #target");
  expect(clean).toHaveLength(2);
  expect(hot).toHaveLength(2);
  expect(hot.some((row) => row.longTaskCount > 0 || (row.clickDurMs ?? 0) > INTERACTION_PERF_CLICK_BREACH_MS)).toBe(true);
  expect(interactionPerfBreachCount(artifact.reports)).toBeGreaterThan(0);
  expect(perf.stdout).toContain(`breach-steps=${interactionPerfBreachCount(artifact.reports)}`);
  expect(artifact.problems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ arm: "interaction-perf", metric: "long-task-count", subject: "click #target", threshold: "0" }),
      expect.objectContaining({
        arm: "interaction-perf",
        metric: "click-duration-ms",
        subject: "click #target",
        threshold: `${String(INTERACTION_PERF_CLICK_BREACH_MS)}ms`,
      }),
    ]),
  );
  expect(index.verdict.state).toBe("passed");
  const state = artifact.timingPolicy === "record" ? "recorded" : "passed";
  expect(index.verdict.arms.find((row) => row.arm === "interaction-perf")?.state).toBe(state);
  expect(report.stdout).toContain(`ARM          interaction-perf state=${state}`);
  expect(perf.stdout).toContain(`perf=${artifact.timingPolicy === "record" ? "recorded" : "measured"}`);
  expect(report.stdout).toContain("interaction thresholds are non-voting");
  expect(report.stdout).toMatch(/FINDING\s+annotation \| long-task-count: .*threshold 0.* \| click #target/u);
  expect(report.stdout).toMatch(/FINDING\s+annotation \| click-duration-ms: .*threshold 100ms.* \| click #target/u);
  expect(report.stdout).not.toMatch(/^PROBLEM\s+arm=interaction-perf/gmu);
}

test("Snap parses selective analyzer flags and keeps the measured motion click inside one ordered tape", async () => {
  const { parseSnapArgs } = await import("../../../../tooling/src/snap/index.ts");
  const parsed = parseSnapArgs([
    "/",
    "--click",
    "#reach",
    "--motion",
    "#measured",
    "--motion-window",
    "900",
    "--pause",
    "25",
    "--wheel",
    "#list=120",
    "--wheel-burst",
    "#list=40:3",
  ]);
  expect(parsed.errors).toEqual([]);
  expect(parsed.motion).toBe(true);
  expect(parsed.motionWindowMs).toBe(900);
  expect(JSON.stringify(parsed.actions)).toContain('"kind":"motion-click"');
  expect(JSON.stringify(parsed.actions)).toMatch(/#reach.*#measured.*pause.*wheel.*wheelburst/u);
});

test("incompatible measurement arms refuse by name before browser work", async ({ runCli }) => {
  const cases = [
    [["--probe", "--motion"], "--probe"],
    [["--motion", "#x", "--perf"], "--motion"],
    [["--motion", "#x", "--cpu-profile"], "--cpu-profile"],
    [["--perf", "--cpu-profile"], "--cpu-profile"],
    [["--boot-trace", "--react-profile"], "--boot-trace"],
    [["--lighthouse", "desktop", "--perf"], "--lighthouse"],
  ] as const;
  for (const [argv, named] of cases) {
    const run = await runCli("snap", [...argv]);
    await expect(run).toExitWith(EXIT.misuse);
    expect(run.stdout).toContain(named);
    expect(run.stdout).not.toContain("run slot");
  }
});

test("malformed unified tape values and matrix-owned manual axes refuse at parse time", async () => {
  const { parseSnapArgs } = await import("../../../../tooling/src/snap/index.ts");
  for (const argv of [
    ["/", "--perf", "--pause", "-1"],
    ["/", "--perf", "--wheel", "#list=nope"],
    ["/", "--perf", "--wheel-burst", "#list=40:0"],
    ["/", "--perf", "--perf-cycles", "1.5"],
    ["/", "--motion", "#x", "--motion-window", "0"],
  ]) {
    expect(parseSnapArgs(argv).errors, argv.join(" ")).not.toEqual([]);
  }

  const matrixAxes = [
    ["--appearance-preset", "compact"],
    ["--appearance", '{"density":"compact"}'],
    ["--theme", "none"],
    ["--mobile"],
    ["--desktop"],
    ["--wide"],
    ["--viewport", "800x600"],
    ["--dark"],
    ["--light"],
    ["--reduced-motion"],
    ["--full-motion"],
  ] as const;
  for (const flags of matrixAxes) {
    const parsed = parseSnapArgs(["/", "--matrix", "--isolated", ...flags]);
    expect(parsed.errors.join("\n"), flags.join(" ")).toContain(flags[0]);
    expect(parsed.errors.join("\n")).toContain("derived matrix plan");
  }
  expect(parseSnapArgs(["/", "--matrix", "--isolated", "--scenario", "appearance-chat"]).errors).toEqual([]);
  expect(parseSnapArgs(["/", "--matrix", "--isolated", "--motion"]).errors.join("\n")).toContain("requires a measured selector");
  expect(parseSnapArgs(["/", "--matrix", "--isolated", "--motion", "#x", "--scenario", "appearance-chat"]).errors.join("\n")).toContain("distinct plans");
});

test("perf meter thresholds are strict evidence but never become an exit gate", () => {
  const boundary = [cleanStep({ clickDurMs: INTERACTION_PERF_CLICK_BREACH_MS })];
  const breach = [cleanStep({ clickDurMs: INTERACTION_PERF_CLICK_BREACH_MS + 1 })];
  const longTask = [cleanStep({ longTaskCount: 1 })];
  expect(interactionPerfBreachCount(boundary)).toBe(0);
  expect(interactionPerfBreachCount(breach)).toBe(1);
  expect(interactionPerfBreachCount(longTask)).toBe(1);
  expect(interactionPerfExit(EXIT.clean, [], null, boundary)).toBe(EXIT.clean);
  expect(interactionPerfExit(EXIT.clean, [], null, breach)).toBe(EXIT.clean);
  expect(interactionPerfExit(EXIT.clean, [], null, longTask)).toBe(EXIT.clean);
  expect(interactionPerfExit(EXIT.violations, [], null, breach)).toBe(EXIT.violations);
  expect(interactionPerfExit(EXIT.clean, [{ evidence: "planted", detail: "missing" }], null, boundary)).toBe(EXIT.toolError);
  expect(interactionPerfExit(EXIT.clean, [], "planted acceleration withhold", boundary)).toBe(EXIT.toolError);
  expect(interactionPerfProblems(boundary, [], null, "assert").some((problem) => problem.metric === "rate-verdict")).toBe(false);
  expect(interactionPerfProblems(boundary, [], "planted acceleration withhold", "assert")).toContainEqual(
    expect.objectContaining({ kind: "evidence-gap", metric: "rate-verdict", observed: "withheld", threshold: "measured" }),
  );
  expect(interactionPerfProblems(breach, [], null, "assert")).toContainEqual(
    expect.objectContaining({ kind: "threshold", metric: "click-duration-ms", observed: "101ms" }),
  );
  expect(interactionPerfProblems(breach, [], null, "record")).toContainEqual(
    expect.objectContaining({ kind: "recorded", metric: "click-duration-ms", observed: "101ms" }),
  );

  const raw: MeterData = {
    longTasks: [{ t: 25, dur: 70, blockingDuration: 20, worstScript: "plantedHot" }],
    events: [{ t: 25, type: "click", inputDelay: 7, processing: 61, dur: 75 }],
    shifts: [{ t: 25, value: 0.02 }],
    rafGaps: [{ t: 25, gap: 45 }],
    stepMarks: [
      { idx: 0, label: "clean", t: 0 },
      { idx: 1, label: "hot", t: 20 },
    ],
    installed: ["long-animation-frame", "event", "layout-shift"],
  };
  expect(buildReports(raw)).toEqual([
    cleanStep(),
    cleanStep({
      idx: 1,
      label: "hot",
      longTaskCount: 1,
      longTaskTotalMs: 70,
      longTaskWorstMs: 70,
      worstBlockingMs: 20,
      worstScript: "plantedHot",
      clickDurMs: 75,
      clickInputDelayMs: 7,
      clickProcessingMs: 61,
      worstRafGapMs: 45,
      shiftScore: 0.02,
    }),
  ]);
});

test.each([0, 1])("interaction perf facts preserve record-only measurements with %i breaches", (breaches) => {
  const input = { requested: true, gaps: [], withheld: null, loadSuspect: null, breaches, timingPolicy: "record" as const };
  expect(interactionPerfFact(input)).toMatchObject({ state: "recorded" });
  expect(interactionPerfFact(input).detail).toContain("interaction thresholds are non-voting");
  expect(interactionPerfFact({ ...input, timingPolicy: "assert" })).toMatchObject({ state: "passed" });
  expect(interactionPerfFact({ ...input, gaps: [{ evidence: "meter", detail: "missing meter" }] })).toEqual({ state: "refused", detail: "missing meter" });
  expect(interactionPerfFact({ ...input, withheld: "unproven browser" })).toEqual({ state: "withheld", detail: "unproven browser" });
  expect(interactionPerfFact({ ...input, loadSuspect: "loaded box" })).toEqual({ state: "load-suspect", detail: "loaded box" });
});

test("Snap motion/perf artifacts are strict supersets of the retained engine evaluations", async ({ runCli, scratch }) => {
  const file = join(scratch, "unified.html");
  await writeFile(file, FIXTURE);
  const motion = await runCli("snap", ["--file", file, "--motion", "#target", "--motion-window", "800", "--motion-no-throttle", "--json", ...QUIET], {
    timeoutMs: CLI_TIMEOUT_MS,
  });
  expect(motion.stdout).toContain("motion=");
  expect(motion.stdout).toContain("frames-raw=");
  expect(motion.stdout).toContain("measured-input=1");
  expect(motion.stdout).toContain("motion-artifact=");
  expect(motion.stdout).not.toContain("frame population is ABSENT");
  const motionArtifact = JSON.parse(await readFile(resultValue(motion.stdout, "motion-artifact"), "utf8")) as {
    readonly contract: string;
    readonly selector: { readonly action: { readonly kind: string; readonly selector: string | null } };
    readonly windowMs: number;
    readonly throttle: number;
    readonly timing: TimingCapability;
    readonly timingPolicy: TimingCapability["policy"];
    readonly gaps: readonly unknown[];
    readonly data: AuditData | null;
  };
  expect(motionArtifact.contract).toBe("snap-motion-v1");
  expect(motionArtifact.selector.action).toMatchObject({ kind: "motion-click", selector: "#target" });
  expect(motionArtifact.windowMs).toBe(800);
  expect(motionArtifact.throttle).toBe(1);
  expect(motionArtifact.data).not.toBeNull();
  const motionData = motionArtifact.data as AuditData;
  const motionEvaluation = evaluateMotionAudit(motionData, motionArtifact.windowMs, motionArtifact.timingPolicy);
  const cls = clsTotals(motionData.motion);
  const observed = observedClsTotals(motionData.motion);
  const observedRaw = observed?.raw;
  expect(observedRaw, "motion artifact omitted observed CLS totals").toBeTypeOf("number");
  const loaf = loafTotals(motionData.motion);
  const animations = animationTotals(motionData.animations, motionData.flags);
  expect(motionData.traceEventCount).toBeGreaterThan(0);
  expect(motion.stdout).toContain(`frames-raw=${motionData.frames.raw.dropped}/${motionData.frames.raw.total}`);
  expect(motion.stdout).toContain(`cls-raw=${cls.raw}`);
  expect(motion.stdout).toContain(`cls-observed-raw=${String(observedRaw)}`);
  expect(motion.stdout).toContain(`worst-blocking-raw=${loaf.rawWorstBlocking}ms`);
  expect(motion.stdout).toContain(`dirty-animations=${animations.rawDirty}`);
  expect(motion.stdout).toContain(`dirty-animations-budgeted=${animations.budgetedDirty}`);
  expect(motion.stdout).toContain(`frames-budget=${motionEvaluation.framesBudgetJudged ? "judged" : "unjudged"}`);

  const perf = await runCli(
    "snap",
    [
      "--file",
      file,
      "--perf",
      "--click",
      "#clean",
      "--click",
      "#target",
      "--pause",
      "20",
      "--wheel",
      "body=30",
      "--wheel-burst",
      "body=10:2",
      "--perf-cycles",
      "2",
      "--json",
      ...QUIET,
    ],
    { timeoutMs: CLI_TIMEOUT_MS },
  );
  expect(perf.stdout).toContain("perf=");
  expect(perf.stdout).toMatch(/steps=[1-9]\d*/u);
  expect(perf.stdout).toContain("perf-artifact=");
  expect(perf.stdout).not.toContain("measurement window is ABSENT");
  const perfArtifact = JSON.parse(await readFile(resultValue(perf.stdout, "perf-artifact"), "utf8")) as PerfArtifact;
  expect(perfArtifact.contract).toBe("snap-interaction-perf-v1");
  expect(perfArtifact.cycles).toBe(2);
  expect(perfArtifact.reports).toEqual(perfArtifact.raw.flatMap(buildReports));
  expect(perfArtifact.raw).not.toEqual([]);
  expect(perfArtifact.gaps).toEqual([]);
  for (const page of perfArtifact.raw) {
    expect(page.installed).toEqual(expect.arrayContaining(["event", "layout-shift"]));
    expect(page.installed?.some((type) => type === "long-animation-frame" || type === "longtask")).toBe(true);
    expect(page.events.some((event) => Number.isFinite(event.inputDelay) && Number.isFinite(event.processing) && Number.isFinite(event.dur))).toBe(true);
  }
  const perfIndex = JSON.parse(await readFile(resultValue(perf.stdout, "index"), "utf8")) as PerfIndex;
  const perfReport = await runCli("snap", ["--report", resultValue(perf.stdout, "index"), "--problems", "--arm", "interaction-perf"]);
  await expect(perfReport).toExitWith(EXIT.clean);
  expect(perfIndex.artifacts.find((artifact) => artifact.producerArm === "interaction-perf")).toMatchObject({
    channel: "interaction-perf",
    completeness: "complete",
    records: perfArtifact.reports.length,
  });
  if (perfArtifact.withheld !== null) {
    await assertWithheldPerf(perf, perfArtifact, perfIndex, perfReport);
    return;
  }
  await assertMeasuredPerf(perf, perfArtifact, perfIndex, perfReport);
});

test("a failing motion artifact carries the exact offender and threshold into the browser-free report", async ({ runCli, scratch }) => {
  const file = join(scratch, "dirty-motion.html");
  await writeFile(file, DIRTY_MOTION_FIXTURE);
  const motion = await runCli("snap", ["--file", file, "--motion", "#target", "--motion-window", "800", "--motion-no-throttle", ...QUIET], {
    timeoutMs: CLI_TIMEOUT_MS,
  });
  const artifact = JSON.parse(await readFile(resultValue(motion.stdout, "motion-artifact"), "utf8")) as {
    readonly problems: readonly AnalyzerProblem[];
  };
  expect(artifact.problems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ arm: "motion", metric: "dirty-animation", subject: "#spin", observed: "width", threshold: "compositor-only" }),
    ]),
  );
  const index = JSON.parse(await readFile(resultValue(motion.stdout, "index"), "utf8")) as {
    readonly results: {
      readonly batches: readonly {
        readonly core: readonly {
          readonly schema: string;
          readonly data: {
            readonly acceleration?: {
              readonly backend: string;
              readonly posture: string;
              readonly gpuCompositing: string;
              readonly rasterization: string;
            };
          };
        }[];
      }[];
    };
  };
  const acceleration = index.results.batches.flatMap((batch) => batch.core).find((fact) => fact.schema === "snap-rate-posture-v1")?.data.acceleration;
  if (acceleration === undefined) {
    throw new Error("the run index omitted its raw browser acceleration provenance");
  }
  expect(["hardware", "software"]).toContain(acceleration.posture);
  expect(acceleration.backend).not.toBe("");
  const software = acceleration.posture === "software";
  const accelerationGap = artifact.problems.find((problem) => problem.metric === "hardware browser acceleration");
  await expect(motion).toExitWith(software ? EXIT.toolError : EXIT.violations);
  expect(acceleration.gpuCompositing === "disabled_software").toBe(software);
  expect(acceleration.rasterization === "disabled_software").toBe(software);
  expect(accelerationGap === undefined).toBe(!software);
  expect(accelerationGap === undefined ? undefined : { observed: accelerationGap.observed, threshold: accelerationGap.threshold }).toEqual(
    software ? { observed: "absent", threshold: "required" } : undefined,
  );
  expect(motion.stdout.includes("SOFTWARE-ACCELERATION-WITHHOLD")).toBe(software);
  expect(String(accelerationGap?.detail).includes(acceleration.backend)).toBe(software);
  const report = await runCli("snap", ["--report", resultValue(motion.stdout, "index"), "--problems", "--arm", "motion"]);
  await expect(report).toExitWith(EXIT.clean);
  expect(report.stdout).toMatch(/FINDING\s+error \| dirty-animation: width \(threshold compositor-only\) \| #spin/u);
  expect(report.stdout).not.toMatch(/^PROBLEM\s+arm=motion/gmu);
});

test("the CPU arm profiles the shared action tape and refuses an empty tape", async ({ runCli, scratch }) => {
  const file = join(scratch, "cpu.html");
  await writeFile(file, FIXTURE);
  const profiled = await runCli("snap", ["--file", file, "--cpu-profile", "--click", "#clean", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(profiled).toExitWith(EXIT.clean);
  const path = resultValue(profiled.stdout, "cpu-profile");
  expect(path).toMatch(/\.cpuprofile$/u);
  const artifact = JSON.parse(await readFile(path, "utf8")) as { readonly nodes?: readonly unknown[]; readonly samples?: readonly unknown[] };
  expect(artifact.nodes?.length).toBeGreaterThan(0);
  expect(artifact.samples?.length).toBeGreaterThan(0);

  const empty = await runCli("snap", ["--file", file, "--cpu-profile", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(empty).toExitWith(EXIT.toolError);
  expect(empty.stdout).toContain("CPU PROFILE REFUSED");
  expect(empty.stdout).toContain("no non-pause action");
  expect(empty.stdout).toContain("cpu-profile=REFUSED");
});
