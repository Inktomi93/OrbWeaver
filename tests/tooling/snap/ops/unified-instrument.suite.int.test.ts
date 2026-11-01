import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Profiler } from "node:inspector";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CliResult } from "@orb/testkit/tooling";
import { expect, test } from "@orb/testkit/tooling";
import type { MeterData, StepReport } from "@orb/tooling/cpu-profile";
import { APPEARANCE_PRESET_FLAG } from "@orb/tooling/floor/appearance/appearance-flags";
import { launchProbeSession, withProbeSession } from "@orb/tooling/floor/browser/browser";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { verifyDevToolsAssets } from "@orb/tooling/floor/devtools/devtools-assets";
import { BOX_LOAD_ENV } from "@orb/tooling/floor/host/load-budget";
import { withProcessEnv } from "@orb/tooling/floor/process/process-env";
import type { AuditData } from "@orb/tooling/motion-audit";
import type { CDPSession } from "@playwright/test";
import { beforeEach, vi } from "vitest";
import { buildReports } from "../../../../tooling/src/cpu-profile/ops/report.ts";
import type { TimingCapability } from "../../../../tooling/src/floor/host/timing-capability.ts";
import { animationTotals } from "../../../../tooling/src/motion-audit/lib/animations.ts";
import { clsTotals, loafTotals, observedClsTotals } from "../../../../tooling/src/motion-audit/lib/verdicts.ts";
import { evaluateMotionAudit } from "../../../../tooling/src/motion-audit/ops/report.ts";
import { interactionPerfFact } from "../../../../tooling/src/snap/lib/interaction-perf-verdict.ts";
import { CPU_PROFILE_ARM } from "../../../../tooling/src/snap/ops/arms/cpu-profile.ts";
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
const CDP_FAULT_ENV = "ORB_PROBE_TEST_CDP_FAULT";

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
    [APPEARANCE_PRESET_FLAG, "compact"],
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

test("the CPU arm profiles the shared action tape and refuses an empty tape", async ({ runCli, scratch, repoRoot }) => {
  const file = join(scratch, "cpu.html");
  await writeFile(file, FIXTURE);
  const profiled = await runCli("snap", ["--file", file, "--cpu-profile", "--click", "#target", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(profiled).toExitWith(EXIT.clean);
  const path = resultValue(profiled.stdout, "cpu-profile");
  expect(path).toMatch(/\.cpuprofile$/u);
  const artifact = JSON.parse(await readFile(path, "utf8")) as Profiler.Profile;
  expect(artifact.nodes.length).toBeGreaterThan(0);
  expect(artifact.samples?.length).toBeGreaterThan(0);
  expect(Number.isFinite(artifact.startTime)).toBe(true);
  expect(Number.isFinite(artifact.endTime)).toBe(true);
  expect(artifact.endTime).toBeGreaterThan(artifact.startTime);
  expect(artifact.timeDeltas?.length).toBe(artifact.samples?.length);
  expect(artifact.timeDeltas?.every(Number.isFinite)).toBe(true);
  const nodeIds = new Set(artifact.nodes.map(({ id }) => id));
  expect(artifact.samples?.every((id) => nodeIds.has(id))).toBe(true);
  const sampledIds = new Set(artifact.samples);
  expect(artifact.nodes.some(({ id, callFrame }) => sampledIds.has(id) && callFrame.url === pathToFileURL(file).href)).toBe(true);

  const assets = verifyDevToolsAssets(join(repoRoot, "tooling/src/snap/lib/devtools-frontend"));
  const modelAsset = assets.manifest.resources.find(({ url }) => url.endsWith("/models/cpu_profile/cpu_profile.js"));
  expect(modelAsset).toBeDefined();
  if (modelAsset === undefined) {
    throw new Error("The verified DevTools closure has no native CPU profile model");
  }
  const profileBytes = await readFile(path);
  const server = createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end();
    } else if (request.url === "/") {
      response
        .writeHead(200, { "content-type": "text/html" })
        .end('<!doctype html><html lang="en"><title>CPU profile import</title><body><main>Native profile consumer</main></body></html>');
    } else if (request.url === "/profile.cpuprofile") {
      response.writeHead(200, { "content-type": "application/json" }).end(profileBytes);
    } else if (request.url === "/favicon.ico") {
      response.writeHead(204).end();
    } else {
      const resource = assets.filesByUrl.get(request.url ?? "");
      if (resource === undefined) {
        response.writeHead(404).end();
      } else {
        response.writeHead(200, { "content-type": resource.entry.mimeType }).end(resource.body);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("The native profile import fixture has no loopback port");
    }
    const origin = `http://127.0.0.1:${String(address.port)}`;
    const modelUrl = `${origin}${modelAsset.url}`;
    const consumer = await launchProbeSession({
      headless: true,
      viewport: { width: 640, height: 480 },
      colorScheme: null,
      reducedMotion: false,
      localStorage: [],
    });
    await withProbeSession(consumer, async () => {
      await consumer.page.goto(origin, { waitUntil: "domcontentloaded" });
      expect(await consumer.page.locator("main").textContent()).toBe("Native profile consumer");
      const imported = await consumer.page.evaluate<string>(
        `(async () => {
          const vendor = await import(${JSON.stringify(modelUrl)});
          const profile = await (await fetch("/profile.cpuprofile")).json();
          const model = new vendor.CPUProfileDataModel.CPUProfileDataModel(profile);
          if (!Number.isFinite(model.profileStartTime) || !Number.isFinite(model.profileEndTime) || model.profileEndTime <= model.profileStartTime) {
            throw new Error("Native DevTools imported a non-finite or empty CPU profile window");
          }
          if (!model.samples?.length || !model.timestamps.length || !model.timestamps.every(Number.isFinite)) {
            throw new Error("Native DevTools imported no finite sampled timeline");
          }
          return "native-cpu-profile-imported";
        })()`,
      );
      expect(imported).toBe("native-cpu-profile-imported");
      expect(consumer.pageErrors).toEqual([]);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }

  const empty = await runCli("snap", ["--file", file, "--cpu-profile", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(empty).toExitWith(EXIT.toolError);
  expect(empty.stdout).toContain("CPU PROFILE REFUSED");
  expect(empty.stdout).toContain("no non-pause action");
  expect(empty.stdout).toContain("cpu-profile=REFUSED");
});

test("CPU stop refusal detaches its native session without closing the owner page", async () => {
  const { parseSnapArgs } = await import("../../../../tooling/src/snap/index.ts");
  await withProcessEnv(CDP_FAULT_ENV, "Profiler.stop", async () => {
    const session = await launchProbeSession({
      headless: true,
      viewport: { width: 640, height: 480 },
      colorScheme: null,
      reducedMotion: false,
      localStorage: [],
    });
    await withProbeSession(session, async () => {
      await session.page.setContent(FIXTURE);
      const openSession = session.context.newCDPSession.bind(session.context);
      let opened = 0;
      let closed = 0;
      session.context.newCDPSession = async (target): Promise<CDPSession> => {
        const cdp = await openSession(target);
        opened += 1;
        cdp.on("close", () => {
          closed += 1;
        });
        return cdp;
      };
      const opts = parseSnapArgs(["/", "--cpu-profile", "--click", "#target"]);
      expect(opts.errors).toEqual([]);
      const action = opts.actions[0];
      if (action === undefined) {
        throw new Error("The CPU refusal control has no parsed action");
      }
      const instance = CPU_PROFILE_ARM.lifecycle.begin(session, opts);
      await instance.beforeAction({ page: session.page, opts, pageIndex: 0, actionIndex: 0, action, navFailuresBefore: 0, stepFailuresBefore: 0 });
      await session.page.locator("#target").click();
      await instance.afterActions({ page: session.page, opts, pageIndex: 0 });
      expect(opened).toBe(1);
      expect(instance.facts()[0]?.data).toMatchObject({ state: "refused", detail: expect.stringContaining("Profiler.stop") });
      expect(instance.exit(EXIT.clean)).toBe(EXIT.toolError);
      await expect.poll(() => closed, { timeout: scaledBudget(5000) }).toBe(1);
      expect(await session.page.locator("#clean").textContent()).toBe("clean");
      expect(session.browser.isConnected()).toBe(true);
    });
  });
});
