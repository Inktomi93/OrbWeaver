#!/usr/bin/env tsx
/**
 * pnpm record <route> [flags]
 *
 * Animation-responsiveness probe. Records a headless chromium video of a scripted
 * interaction sequence against the running dev stack (`pnpm stack start` first), then
 * renders it with ffmpeg:
 *
 *   reports/recordings/<out>.webm         — always (Playwright's native capture)
 *   reports/recordings/<out>.gif          — watchable (20fps, palette-optimized)
 *   reports/recordings/<out>-click<i>.png — 6-tile × 120ms strip around each click for
 *                                           click→motion latency counting
 *   reports/recordings/<out>-step<i>.png  — with --frames [offsetMs]: one full-res PNG
 *                                           per step at dispatch+offset (default 450ms)
 *
 * A 28px CLICK MARKER square sits fixed in the top-left corner and cycles color
 * (red→lime→cyan→magenta…) at the EXACT dispatch of every --click/--jsclick — find the
 * tile where the corner changes, count tiles until the UI responds (1 tile = 120ms).
 *
 * FFMPEG DEGRADATION: no ffmpeg → the webm still lands, gif/strip/frames legs SKIP with a
 * reason in the RESULT line, exit stays 0 (skip ≠ fail). Playwright's bundled ffmpeg is NOT
 * a fallback (screencast-only build, no palette/tile filters).
 *
 * USAGE
 *   pnpm stack start
 *   pnpm record / --click '[data-shell-toggle="drawer-left"]' --pause 900 \
 *                 --click '[data-shell-toggle="drawer-left"]' --out drawer-left
 *   Flags: --base <url> (default localhost:5173) · --viewport WxH (default 1280x800) ·
 *          --click/--jsclick/--hover "sel" · --fill "sel=v" · --wheel "sel=dy" ·
 *          --pause <ms> · --settle <ms> (initial, default 1500) · --out <name> ·
 *          --frames [offsetMs]
 */
import { spawnSync } from "node:child_process";
import { copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { artifactDir } from "./_kit/artifacts.ts";
import type { ProbeSession } from "./_kit/browser.ts";
import { buildUrl, DEFAULT_BASE, launchProbeSession, settle } from "./_kit/browser.ts";
import { resolveFfmpeg } from "./_kit/ffmpeg.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseViewport, splitLastEq } from "./_kit/flags.ts";
import type { ResultPair } from "./_kit/result.ts";
import { print, printResult } from "./_kit/result.ts";

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_SETTLE_MS = 1500;
const DEFAULT_STEP_SETTLE_MS = 600;
const DEFAULT_PAUSE_MS = 600;
const DEFAULT_FRAMES_OFFSET_MS = 450;
const TRAILING_SETTLE_MS = 900;
const STEP_TIMEOUT_MS = 5000;
const NAV_TIMEOUT_MS = 20_000;
const DEFAULT_WHEEL_DY = 600;
const MS_PER_S = 1000;
const CLICK_STRIP_PRE_S = 0.05;
const CLICK_STRIP_LEN_S = 0.75;
const T_PAD = 6;

type Step =
  | { readonly kind: "click" | "jsclick" | "hover"; readonly selector: string }
  | { readonly kind: "fill"; readonly selector: string; readonly value: string }
  | { readonly kind: "wheel"; readonly selector: string; readonly dy: number }
  | { readonly kind: "pause"; readonly ms: number };

type Args = {
  route: string;
  base: string;
  out: string;
  viewport: Viewport;
  settleMs: number;
  /** Non-null: dump one full-res PNG per step at dispatch+offset ms. */
  framesOffsetMs: number | null;
  steps: Step[];
};

const INT_RE = /^\d+$/u;

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
  if (flag === "--wheel") {
    const { head, tail } = splitLastEq(rest.shift() ?? "");
    steps.push({
      kind: "wheel",
      selector: head,
      dy: tail === "" ? DEFAULT_WHEEL_DY : Number(tail),
    });
    return true;
  }
  return false;
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
  if (flag === "--frames") {
    // Optional numeric offset argument; bare --frames takes the default.
    const peek = rest[0];
    args.framesOffsetMs = peek !== undefined && INT_RE.test(peek) ? Number(rest.shift()) : DEFAULT_FRAMES_OFFSET_MS;
    return true;
  }
  return false;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    base: DEFAULT_BASE,
    out: "recording",
    viewport: DEFAULT_VIEWPORT,
    settleMs: DEFAULT_SETTLE_MS,
    framesOffsetMs: null,
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
  return args;
}

// Marker palette — high-contrast cycle so consecutive clicks are tellable apart.
const MARKER_COLORS = ["#ff2020", "#20ff20", "#20d0ff", "#ff20ff", "#ffd020", "#ffffff"];

// The click marker: a fixed corner square, installed pre-navigation so it exists from first
// paint. Raw string (not a function) — see _kit/browser.ts.
const MARKER_INIT_JS = `(() => {
  const el = document.createElement("div");
  el.id = "__probe-marker";
  el.style.cssText =
    "position:fixed;top:0;left:0;width:28px;height:28px;z-index:2147483647;background:#404040;pointer-events:none";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el));
})();`;

type TimedLine = { readonly t: number; readonly label: string };

type Recording = {
  readonly videoPath: string | null;
  readonly stepTimeline: TimedLine[];
  readonly clickTimes: TimedLine[];
  readonly perfLines: TimedLine[];
  readonly failures: number;
  readonly pageErrors: number;
};

type StepRun = {
  readonly session: ProbeSession;
  readonly t0: number;
  readonly stepTimeline: TimedLine[];
  readonly clickTimes: TimedLine[];
  clickIndex: number;
};

/** Dispatch ONE non-pause step (throws on locator/timeout failure — counted by the caller). */
async function dispatchStep(run: StepRun, step: Exclude<Step, { kind: "pause" }>): Promise<void> {
  const { page } = run.session;
  const loc = page.locator(step.selector).first();
  if (step.kind === "jsclick") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
  } else {
    await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  }
  if (step.kind === "click" || step.kind === "jsclick") {
    // Flip the marker in the same task as the dispatch — the video frame where the
    // corner changes IS the click frame.
    const color = MARKER_COLORS[run.clickIndex % MARKER_COLORS.length] as string;
    run.clickIndex += 1;
    await page.evaluate(`(() => { const m = document.getElementById("__probe-marker"); if (m) m.style.background = ${JSON.stringify(color)}; })()`);
    run.clickTimes.push({ t: Date.now() - run.t0, label: `${step.kind} ${step.selector}` });
    if (step.kind === "jsclick") {
      await loc.evaluate("(el) => el.click()");
    } else {
      await loc.click({ timeout: STEP_TIMEOUT_MS });
    }
  } else if (step.kind === "hover") {
    await loc.hover();
  } else if (step.kind === "wheel") {
    await loc.hover();
    await page.mouse.wheel(0, step.dy);
  } else if (step.kind === "fill") {
    await loc.fill(step.value);
  }
}

async function runSteps(run: StepRun, steps: readonly Step[]): Promise<number> {
  let failures = 0;
  for (const step of steps) {
    if (step.kind === "pause") {
      // biome-ignore lint/performance/noAwaitInLoops: steps execute sequentially BY DESIGN — this is a scripted interaction tape, not parallel work.
      await settle(run.session.page, step.ms);
      continue;
    }
    const label = `${step.kind} ${step.selector}${step.kind === "wheel" ? `=${step.dy}` : ""}`;
    run.stepTimeline.push({ t: Date.now() - run.t0, label });
    try {
      await dispatchStep(run, step);
      // Small default settle so back-to-back steps don't merge on tape.
      await settle(run.session.page, DEFAULT_STEP_SETTLE_MS);
    } catch (e) {
      failures += 1;
      print(`STEP FAILED  ${label}: ${errorMessage(e)}`);
    }
  }
  return failures;
}

async function recordVideo(opts: Args, outDir: string): Promise<Recording> {
  const url = buildUrl(opts.base, opts.route);
  const videoDir = join(outDir, `.video-${opts.out}`);
  await rm(videoDir, { recursive: true, force: true });

  const session = await launchProbeSession({
    headless: true,
    viewport: opts.viewport,
    colorScheme: null,
    reducedMotion: false, // a motion probe wants the real animations
    localStorage: [],
    recordVideoDir: videoDir,
  });
  await session.context.addInitScript({ content: MARKER_INIT_JS });

  // Timestamped [perf] console capture, aligned to the step timeline below.
  const t0 = Date.now();
  const perfLines: TimedLine[] = [];
  session.page.on("console", (m) => {
    const text = m.text();
    if (text.includes("[perf]") || m.type() === "error") {
      perfLines.push({ t: Date.now() - t0, label: `[${m.type()}] ${text}` });
    }
  });

  const run: StepRun = { session, t0, stepTimeline: [], clickTimes: [], clickIndex: 0 };
  let failures = 0;
  let videoPath: string | null = null;
  try {
    await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await settle(session.page, opts.settleMs);
    failures = await runSteps(run, opts.steps);
    // Trailing settle so the last animation completes on tape.
    await settle(session.page, TRAILING_SETTLE_MS);
  } finally {
    // Grab the video handle BEFORE closing (page.video() is null after teardown);
    // resolve .path() after context.close() flushes the file.
    const videoObj = session.page.video();
    await session.context.close();
    await session.browser.close();
    videoPath = (await videoObj?.path()) ?? null;
  }
  return {
    videoPath,
    stepTimeline: run.stepTimeline,
    clickTimes: run.clickTimes,
    perfLines,
    failures,
    pageErrors: session.pageErrors.length,
  };
}

function runFfmpeg(bin: string, args: string[]): boolean {
  const res = spawnSync(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
  if (res.status !== 0) {
    const FF_TAIL_LINES = 4;
    print(`ffmpeg failed: ${res.stderr?.toString().split("\n").slice(-FF_TAIL_LINES).join("\n")}`);
    return false;
  }
  return true;
}

const GIF_FPS_SCALE = "fps=20,scale=960:-1:flags=lanczos";
const STRIP_FILTER = "fps=8.33,scale=700:-1,tile=6x1:padding=2";

type RenderJob = {
  readonly ffmpeg: string;
  readonly rec: Recording;
  readonly webm: string;
  readonly outDir: string;
  readonly opts: Args;
};

type Rendered = { gif: string | null; strips: number; frames: number };

/** GIF (two-pass palette for crisp UI colors) + per-click strips + optional per-step frames. */
async function renderArtifacts(job: RenderJob): Promise<Rendered> {
  const { ffmpeg, rec, webm, outDir, opts } = job;
  const gif = join(outDir, `${opts.out}.gif`);
  const palette = join(outDir, `.${opts.out}-palette.png`);
  const paletteOk = runFfmpeg(ffmpeg, ["-y", "-i", webm, "-vf", `${GIF_FPS_SCALE},palettegen`, palette]);
  const gifOk = paletteOk && runFfmpeg(ffmpeg, ["-y", "-i", webm, "-i", palette, "-lavfi", `${GIF_FPS_SCALE}[x];[x][1:v]paletteuse`, gif]);
  await rm(palette, { force: true });

  // Per-click windows: 6 tiles × 120ms starting just before each click — count tiles
  // from the marker flip to first motion.
  let strips = 0;
  for (const [i, ct] of rec.clickTimes.entries()) {
    const start = Math.max(0, ct.t / MS_PER_S - CLICK_STRIP_PRE_S);
    const win = join(outDir, `${opts.out}-click${i + 1}.png`);
    const ok = runFfmpeg(ffmpeg, ["-y", "-ss", start.toFixed(2), "-t", String(CLICK_STRIP_LEN_S), "-i", webm, "-vf", STRIP_FILTER, "-frames:v", "1", win]);
    if (ok) {
      strips += 1;
      print(`click ${i + 1}      t=${ct.t}ms ${ct.label} → ${win}  (6 tiles × 120ms)`);
    }
  }

  // Full-res per-step frames (--frames): the post-animation moment per interaction, for
  // review without scrubbing the GIF.
  let frames = 0;
  if (opts.framesOffsetMs !== null) {
    for (const [i, st] of rec.stepTimeline.entries()) {
      const at = Math.max(0, (st.t + opts.framesOffsetMs) / MS_PER_S);
      const frame = join(outDir, `${opts.out}-step${i + 1}.png`);
      const ok = runFfmpeg(ffmpeg, ["-y", "-ss", at.toFixed(2), "-i", webm, "-frames:v", "1", frame]);
      if (ok) {
        frames += 1;
        print(`step ${i + 1}       t=${st.t}ms+${opts.framesOffsetMs} ${st.label} → ${frame}`);
      }
    }
  }
  return { gif: gifOk ? gif : null, strips, frames };
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = await artifactDir("recordings");
  const rec = await recordVideo(opts, outDir);

  if (rec.videoPath === null) {
    print("ERROR        no video produced");
    printResult("record", [
      ["video", "NONE"],
      ["step-failures", rec.failures],
    ]);
    return 1;
  }
  const webm = join(outDir, `${opts.out}.webm`);
  await copyFile(rec.videoPath, webm);
  await rm(join(outDir, `.video-${opts.out}`), { recursive: true, force: true });

  const ffmpeg = resolveFfmpeg();
  let rendered: Rendered = { gif: null, strips: 0, frames: 0 };
  if (ffmpeg === null) {
    print("SKIP         gif/strips/frames — no ffmpeg (FFMPEG_BIN or PATH); webm still recorded");
  } else {
    rendered = await renderArtifacts({ ffmpeg, rec, webm, outDir, opts });
  }

  print(`video        ${webm}`);
  if (rendered.gif !== null) {
    print(`gif          ${rendered.gif}`);
  }
  print("--- step timeline ---");
  for (const s of rec.stepTimeline) {
    print(`  ${String(s.t).padStart(T_PAD)}ms  ${s.label}`);
  }
  print(`--- console: ${rec.perfLines.length} perf/error line(s) ---`);
  for (const l of rec.perfLines) {
    print(`  ${String(l.t).padStart(T_PAD)}ms  ${l.label}`);
  }

  const skipReason = ffmpeg === null ? "SKIPPED(no-ffmpeg)" : null;
  const pairs: ResultPair[] = [
    ["video", webm],
    ["gif", skipReason ?? rendered.gif ?? "FAILED"],
    ["click-strips", skipReason ?? rendered.strips],
    ["step-frames", opts.framesOffsetMs === null ? "(off)" : (skipReason ?? rendered.frames)],
    ["steps", rec.stepTimeline.length],
    ["step-failures", rec.failures],
    ["page-errors", rec.pageErrors],
    ["perf-lines", rec.perfLines.length],
  ];
  printResult("record", pairs);
  // Skip ≠ fail (the ffmpeg contract); red only when the interaction itself broke.
  return rec.failures > 0 || rec.pageErrors > 0 ? 1 : 0;
}

void main().then((code) => process.exit(code));
