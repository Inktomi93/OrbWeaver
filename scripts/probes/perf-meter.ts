#!/usr/bin/env tsx
/**
 * pnpm perf-meter <route> [flags]
 *
 * Interaction-responsiveness instrumentation. Runs a scripted step sequence against the
 * running dev stack (`pnpm stack start` first) and buckets, PER STEP:
 *
 *   • long tasks (>50ms main-thread blocks) — count, total, worst
 *   • PerformanceEventTiming for the dispatched click — input delay, processing time, and
 *     full duration (input→next paint)
 *   • worst rAF gap inside the step's window (dropped-frame proxy)
 *   • layout-shift score attributed to the window
 *
 * Output: a per-step console table + reports/perf-meter/<out>.json with the raw entries, so
 * repetition-decay questions ("is the 8th open slower than the 1st?") are a column scan.
 *
 * USAGE
 *   pnpm stack start
 *   pnpm perf-meter / --click '[data-testid=drawer-toggle]' --pause 700 \
 *                    --click '[data-testid=drawer-toggle]' --out drawer-cycle
 *   Flags: --base <url> · --viewport WxH (default 1280x800) · --settle <ms> (default 2000) ·
 *          --click/--jsclick/--hover/--fill "sel[=v]" · --wheel "sel=dy" (one tick) ·
 *          --wheelburst "sel=dy:n" (n rapid ticks, 30ms apart — a scroll storm) ·
 *          --pause <ms> · --cycles <n> (repeat the WHOLE step sequence n times — the
 *          one-liner for repetition-decay runs) · --out <name> · --cpuprofile (ALSO capture a
 *          V8 CPU profile of the whole step sequence → reports/perf-meter/<out>.cpuprofile —
 *          open in Chrome DevTools Performance panel or speedscope.app for the flame graph;
 *          the function-level "WHO burned that long task" answer the per-step table can't give)
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { artifactDir } from "./_kit/artifacts.ts";
import { buildUrl, DEFAULT_BASE, launchProbeSession, settle } from "./_kit/browser.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseViewport, splitLastEq } from "./_kit/flags.ts";
import type { ResultPair } from "./_kit/result.ts";
import { print, printResult } from "./_kit/result.ts";

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_SETTLE_MS = 2000;
const DEFAULT_STEP_SETTLE_MS = 600;
const DEFAULT_PAUSE_MS = 600;
const TRAILING_SETTLE_MS = 800;
const WHEEL_TICK_PAUSE_MS = 30;
const STEP_TIMEOUT_MS = 5000;
const NAV_TIMEOUT_MS = 20_000;
const DEFAULT_WHEEL_DY = 400;
const DEFAULT_WHEELBURST_DY = 400;
const DEFAULT_WHEELBURST_COUNT = 10;
const CPU_SAMPLING_INTERVAL_US = 100; // 10kHz
const CLICK_DUR_BREACH_MS = 100;
const LABEL_MAX = 70;
const IDX_PAD = 3;
const MS_PAD_4 = 4;
const MS_PAD_5 = 5;
const MS_PAD_6 = 6;
const SHIFT_DECIMALS = 4;

type Step =
  | { readonly kind: "click" | "jsclick" | "hover"; readonly selector: string }
  | { readonly kind: "fill"; readonly selector: string; readonly value: string }
  | { readonly kind: "wheel"; readonly selector: string; readonly dy: number }
  | {
      readonly kind: "wheelburst";
      readonly selector: string;
      readonly dy: number;
      readonly count: number;
    }
  | { readonly kind: "pause"; readonly ms: number };

type Args = {
  route: string;
  base: string;
  out: string;
  viewport: Viewport;
  settleMs: number;
  cycles: number;
  cpuProfile: boolean;
  steps: Step[];
};

/** The wheel-family flags (--wheel/--wheelburst) split out of parseStepFlag purely to keep its
 *  cognitive-complexity under the biome cap — same `sel=dy[:n]` LAST-`=` idiom either way. */
function parseWheelFlag(flag: string, rest: string[], steps: Step[]): boolean {
  if (flag === "--wheel") {
    const { head, tail } = splitLastEq(rest.shift() ?? "");
    steps.push({
      kind: "wheel",
      selector: head,
      dy: tail === "" ? DEFAULT_WHEEL_DY : Number(tail),
    });
    return true;
  }
  if (flag === "--wheelburst") {
    // sel=dy:n
    const { head, tail } = splitLastEq(rest.shift() ?? "");
    const [dyRaw, nRaw] = tail.split(":");
    steps.push({
      kind: "wheelburst",
      selector: head,
      dy: dyRaw === undefined || dyRaw === "" ? DEFAULT_WHEELBURST_DY : Number(dyRaw),
      count: nRaw === undefined || nRaw === "" ? DEFAULT_WHEELBURST_COUNT : Number(nRaw),
    });
    return true;
  }
  return false;
}

/** The step-producing flags. Returns false when `flag` isn't one of them. */
function parseStepFlag(flag: string, rest: string[], steps: Step[]): boolean {
  if (flag === "--pause") {
    steps.push({ kind: "pause", ms: Number(rest.shift() ?? String(DEFAULT_PAUSE_MS)) });
    return true;
  }
  if (flag === "--click" || flag === "--jsclick" || flag === "--hover") {
    steps.push({
      kind: flag.slice(2) as "click" | "jsclick" | "hover",
      selector: rest.shift() ?? "",
    });
    return true;
  }
  if (flag === "--fill") {
    // LAST `=` split — selectors contain `=`, values rarely do (_kit/flags.ts).
    const { head, tail } = splitLastEq(rest.shift() ?? "");
    steps.push({ kind: "fill", selector: head, value: tail });
    return true;
  }
  return parseWheelFlag(flag, rest, steps);
}

function parseScalarFlag(flag: string, rest: string[], args: Args): boolean {
  if (flag === "--base") {
    args.base = rest.shift() ?? DEFAULT_BASE;
    return true;
  }
  if (flag === "--out") {
    args.out = rest.shift() ?? args.out;
    return true;
  }
  if (flag === "--settle") {
    args.settleMs = Number(rest.shift() ?? String(DEFAULT_SETTLE_MS));
    return true;
  }
  if (flag === "--viewport") {
    args.viewport = parseViewport(rest.shift() ?? "") ?? args.viewport;
    return true;
  }
  if (flag === "--cycles") {
    args.cycles = Math.max(1, Number(rest.shift() ?? "1"));
    return true;
  }
  if (flag === "--cpuprofile") {
    args.cpuProfile = true;
    return true;
  }
  return false;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    base: DEFAULT_BASE,
    out: "perf-meter",
    viewport: DEFAULT_VIEWPORT,
    settleMs: DEFAULT_SETTLE_MS,
    cycles: 1,
    cpuProfile: false,
    steps: [],
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift() as string;
    if (parseScalarFlag(a, rest, args) || parseStepFlag(a, rest, args.steps)) {
      continue;
    }
    if (!a.startsWith("--")) {
      args.route = a;
    }
  }
  // Repetition-decay one-liner: unroll the whole sequence n times. The per-step table keeps
  // absolute indices, so decay reads as a column scan.
  if (args.cycles > 1) {
    const once = [...args.steps];
    for (let c = 1; c < args.cycles; c += 1) {
      args.steps.push(...once);
    }
  }
  return args;
}

// In-page collector. Raw string, not a function — see _kit/browser.ts.
const METER_INIT_JS = `(() => {
  const m = (window.__perfMeter = {
    longTasks: [],   // {t, dur}
    events: [],      // {t, type, inputDelay, processing, dur}
    shifts: [],      // {t, value}
    rafGaps: [],     // {t, gap}
    stepMarks: [],   // {idx, label, t}
    markStep(idx, label) { this.stepMarks.push({ idx, label, t: performance.now() }); },
  });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) m.longTasks.push({ t: e.startTime, dur: e.duration });
    }).observe({ type: "longtask", buffered: true });
  } catch (_e) { /* longtask unsupported — the bucket just stays empty */ }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        m.events.push({
          t: e.startTime,
          type: e.name,
          inputDelay: Math.max(0, e.processingStart - e.startTime),
          processing: Math.max(0, e.processingEnd - e.processingStart),
          dur: e.duration,
        });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch (_e) { /* event timing unsupported */ }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (!e.hadRecentInput) m.shifts.push({ t: e.startTime, value: e.value });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (_e) { /* layout-shift unsupported */ }
  let last = performance.now();
  const loop = (now) => {
    const gap = now - last;
    if (gap > 33) m.rafGaps.push({ t: now, gap });
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();`;

type LongTask = { readonly t: number; readonly dur: number };
type PerfEvent = {
  readonly t: number;
  readonly type: string;
  readonly inputDelay: number;
  readonly processing: number;
  readonly dur: number;
};
type Shift = { readonly t: number; readonly value: number };
type RafGap = { readonly t: number; readonly gap: number };
type StepMark = { readonly idx: number; readonly label: string; readonly t: number };

type MeterData = {
  readonly longTasks: LongTask[];
  readonly events: PerfEvent[];
  readonly shifts: Shift[];
  readonly rafGaps: RafGap[];
  readonly stepMarks: StepMark[];
};

type MeterWindow = { __perfMeter: MeterData & { markStep: (i: number, l: string) => void } };

type StepReport = {
  readonly idx: number;
  readonly label: string;
  readonly longTaskCount: number;
  readonly longTaskTotalMs: number;
  readonly longTaskWorstMs: number;
  readonly clickDurMs: number | null;
  readonly clickInputDelayMs: number | null;
  readonly worstRafGapMs: number;
  readonly shiftScore: number;
};

type PageHandle = Awaited<ReturnType<typeof launchProbeSession>>["page"];

/** Tell the in-page collector which step is starting — every entry until the next mark is bucketed here. */
async function markStep(page: PageHandle, idx: number, label: string): Promise<void> {
  await page.evaluate(
    ([i, l]) => {
      (globalThis as unknown as MeterWindow).__perfMeter.markStep(Number(i), String(l));
    },
    [String(idx), label] as const,
  );
}

/** Dispatch ONE non-pause step, marking it first so its window starts at dispatch (throws on
 *  locator/timeout failure — counted by the caller, same contract as record.ts). */
async function dispatchStep(
  page: PageHandle,
  idx: number,
  step: Exclude<Step, { kind: "pause" }>,
): Promise<void> {
  if (step.kind === "wheel" || step.kind === "wheelburst") {
    const loc = page.locator(step.selector).first();
    await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
    const n = step.kind === "wheelburst" ? step.count : 1;
    await markStep(page, idx, `${step.kind} ${step.selector} dy=${step.dy}×${n}`);
    await loc.hover();
    for (let i = 0; i < n; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: a wheel BURST is a sequential tape of ticks by design — parallel wheel events would collapse into one.
      await page.mouse.wheel(0, step.dy);
      if (n > 1) {
        await settle(page, WHEEL_TICK_PAUSE_MS);
      }
    }
    return;
  }
  const loc = page.locator(step.selector).first();
  if (step.kind === "jsclick") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    await markStep(page, idx, `jsclick ${step.selector}`);
    await loc.evaluate("(el) => el.click()");
    return;
  }
  await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  const label =
    step.kind === "fill" ? `fill ${step.selector}=${step.value}` : `${step.kind} ${step.selector}`;
  await markStep(page, idx, label);
  if (step.kind === "click") {
    await loc.click({ timeout: STEP_TIMEOUT_MS });
  } else if (step.kind === "hover") {
    await loc.hover();
  } else if (step.kind === "fill") {
    await loc.fill(step.value);
  }
}

async function runSteps(page: PageHandle, steps: readonly Step[]): Promise<number> {
  let failures = 0;
  let idx = 0;
  for (const step of steps) {
    if (step.kind === "pause") {
      // biome-ignore lint/performance/noAwaitInLoops: steps execute sequentially BY DESIGN — a scripted tape, not parallel work.
      await settle(page, step.ms);
      continue;
    }
    try {
      await dispatchStep(page, idx, step);
      idx += 1;
      // Small default settle so back-to-back steps don't merge into one window.
      await settle(page, DEFAULT_STEP_SETTLE_MS);
    } catch (e) {
      failures += 1;
      idx += 1;
      const selector = "selector" in step ? step.selector : "";
      print(`STEP FAILED  ${step.kind} ${selector}: ${errorMessage(e)}`);
    }
  }
  return failures;
}

/** Bucket long tasks / click events / rAF gaps / layout shifts into [mark.t, nextMark.t) windows. */
function buildReports(data: MeterData): StepReport[] {
  const marks = data.stepMarks;
  const windowEnd = (i: number): number => {
    const next = marks[i + 1];
    return next === undefined ? Number.POSITIVE_INFINITY : next.t;
  };
  return marks.map((mk, i) => {
    const end = windowEnd(i);
    const inWin = <T extends { readonly t: number }>(xs: readonly T[]): T[] =>
      xs.filter((x) => x.t >= mk.t && x.t < end);
    const lts = inWin(data.longTasks);
    const clicks = inWin(data.events).filter((e) => e.type === "click" || e.type === "pointerup");
    const worstClick = clicks.reduce<PerfEvent | null>(
      (acc, c) => (acc === null || c.dur > acc.dur ? c : acc),
      null,
    );
    const gaps = inWin(data.rafGaps);
    return {
      idx: mk.idx,
      label: mk.label,
      longTaskCount: lts.length,
      longTaskTotalMs: Math.round(lts.reduce((a, x) => a + x.dur, 0)),
      longTaskWorstMs: Math.round(lts.reduce((a, x) => Math.max(a, x.dur), 0)),
      clickDurMs: worstClick === null ? null : Math.round(worstClick.dur),
      clickInputDelayMs: worstClick === null ? null : Math.round(worstClick.inputDelay),
      worstRafGapMs: Math.round(gaps.reduce((a, x) => Math.max(a, x.gap), 0)),
      shiftScore: Number(
        inWin(data.shifts)
          .reduce((a, x) => a + x.value, 0)
          .toFixed(SHIFT_DECIMALS),
      ),
    };
  });
}

function printTable(reports: readonly StepReport[]): void {
  print("idx  longTasks(total/worst)  click(dur/delay)  rafGap  shift  label");
  for (const r of reports) {
    const lt = `${String(r.longTaskCount).padStart(2)} (${String(r.longTaskTotalMs).padStart(MS_PAD_4)}/${String(r.longTaskWorstMs).padStart(MS_PAD_4)})`;
    const click =
      r.clickDurMs === null
        ? "      —     "
        : `${String(r.clickDurMs).padStart(MS_PAD_5)}/${String(r.clickInputDelayMs).padStart(MS_PAD_4)}`;
    print(
      [
        String(r.idx).padStart(IDX_PAD),
        lt,
        click,
        String(r.worstRafGapMs).padStart(MS_PAD_5),
        String(r.shiftScore).padStart(MS_PAD_6),
        r.label.slice(0, LABEL_MAX),
      ].join("  "),
    );
  }
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = await artifactDir("perf-meter");
  const url = buildUrl(opts.base, opts.route);

  const session = await launchProbeSession({
    headless: true,
    viewport: opts.viewport,
    colorScheme: null,
    reducedMotion: false, // a motion probe wants the real animations
    localStorage: [],
  });
  await session.context.addInitScript({ content: METER_INIT_JS });
  const { page } = session;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  await settle(page, opts.settleMs);

  // V8 sampling profiler over the whole step sequence (CDP). Post-settle start so app boot
  // doesn't drown the interactions in the flame graph.
  const cdp = opts.cpuProfile ? await session.context.newCDPSession(page) : null;
  if (cdp !== null) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: CPU_SAMPLING_INTERVAL_US });
    await cdp.send("Profiler.start");
  }

  const failures = await runSteps(page, opts.steps);
  await settle(page, TRAILING_SETTLE_MS);

  let profilePath: string | null = null;
  if (cdp !== null) {
    const { profile } = (await cdp.send("Profiler.stop")) as { profile: unknown };
    profilePath = join(outDir, `${opts.out}.cpuprofile`);
    await writeFile(profilePath, JSON.stringify(profile));
  }

  const data = await page.evaluate(() => (globalThis as unknown as MeterWindow).__perfMeter);
  const pageErrors = session.pageErrors;
  await session.context.close();
  await session.browser.close();

  const reports = buildReports(data);
  const outPath = join(outDir, `${opts.out}.json`);
  await writeFile(outPath, JSON.stringify({ args: opts, reports, raw: data, pageErrors }, null, 2));

  print(`URL      ${url}`);
  print(`json     ${outPath}`);
  if (profilePath !== null) {
    print(`profile  ${profilePath}  (Chrome DevTools Performance panel / speedscope.app)`);
  }
  print(
    `steps    ${reports.length} · page errors ${pageErrors.length} · step failures ${failures}`,
  );
  print("");
  printTable(reports);
  if (pageErrors.length > 0) {
    print("");
    print("--- page errors ---");
    for (const e of pageErrors) {
      print(e);
    }
  }

  const breachSteps = reports.filter(
    (r) => r.longTaskCount > 0 || (r.clickDurMs ?? 0) > CLICK_DUR_BREACH_MS,
  );
  const worstLt = reports.reduce((a, r) => Math.max(a, r.longTaskWorstMs), 0);
  const worstClick = reports.reduce((a, r) => Math.max(a, r.clickDurMs ?? 0), 0);
  const pairs: ResultPair[] = [
    ["steps", reports.length],
    ["breach-steps", breachSteps.length],
    ["worst-longtask", `${worstLt}ms`],
    ["worst-click", `${worstClick}ms`],
    ["step-failures", failures],
    ["page-errors", pageErrors.length],
    ["json", outPath],
  ];
  if (profilePath !== null) {
    pairs.push(["profile", profilePath]);
  }
  printResult("perf-meter", pairs);
  return failures > 0 || pageErrors.length > 0 ? 1 : 0;
}

void main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    print(`perf-meter failed: ${errorMessage(err)}`);
    process.exit(1);
  },
);
