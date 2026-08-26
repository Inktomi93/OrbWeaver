// The recording leg: launch with video capture, install the marker pre-navigation, drive the tape,
// transcribe the perf/motion console channels alongside the step timeline.
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { buildUrl, launchProbeSession, settle, withProbeSession } from "@orb/tooling/_shared/browser";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, Recording, StepRun, TimedLine } from "../contract/types.ts";
import { MARKER_INIT_JS, runSteps } from "./drive.ts";

refuseDirectInvocation(import.meta.url, "pnpm record");

const NAV_TIMEOUT_MS = 20_000;
const TRAILING_SETTLE_MS = 900;
// The console channels a motion recording transcribes. `[perf]` = render-profiler's slow REACT
// COMMIT; the rest are the motion flagger pack's (motion-flaggers.ts + long-task-tracer.ts). Adding
// a channel there means adding it here — a tag nobody transcribes is invisible in the artifact this
// probe exists to produce.
const PERF_TAGS = ["[perf]", "[frame]", "[reflow]", "[input]", "[anim]", "[css]", "[drop]", "[space]", "[cls]"] as const;

export async function recordVideo(opts: Args, outDir: string): Promise<Recording> {
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
  const recorded = await withProbeSession(session, async () => {
    await session.context.addInitScript({ content: MARKER_INIT_JS });

    // Timestamped perf/motion console capture, aligned to the step timeline below. The tag list is the
    // MOTION FLAGGER PACK's vocabulary (packages/client/src/lib/motion-flaggers.ts header) plus `[perf]`
    // (render-profiler's slow-commit channel) — a recording of a motion flow whose transcript drops the
    // motion flags is exactly the receipt that proves nothing.
    const t0 = Date.now();
    const perfLines: TimedLine[] = [];
    session.page.on("console", (m) => {
      const text = m.text();
      if (PERF_TAGS.some((tag) => text.includes(tag)) || m.type() === "error") {
        perfLines.push({ t: Date.now() - t0, label: `[${m.type()}] ${text}` });
      }
    });

    const run: StepRun = { session, t0, stepTimeline: [], clickTimes: [], clickIndex: 0 };
    await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await settle(session.page, opts.settleMs);
    const failures = await runSteps(run, opts.steps);
    // Trailing settle so the last animation completes on tape.
    await settle(session.page, TRAILING_SETTLE_MS);
    // Grab the video handle BEFORE closing (page.video() is null after teardown);
    // resolve .path() after context.close() flushes the file.
    return { failures, perfLines, run, video: session.page.video() };
  });
  return {
    videoPath: (await recorded.video?.path()) ?? null,
    stepTimeline: recorded.run.stepTimeline,
    clickTimes: recorded.run.clickTimes,
    perfLines: recorded.perfLines,
    failures: recorded.failures,
    pageErrors: session.pageErrors.length,
  };
}
