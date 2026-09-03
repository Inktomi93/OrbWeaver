// The recording leg: launch with video capture, install the marker pre-navigation, drive the tape,
// transcribe the perf/motion console channels alongside the step timeline.
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ProbeSession } from "@orb/tooling/_shared/browser";
import { attachProbeSession, buildUrl, launchProbeSession, settle, withProbeSession } from "@orb/tooling/_shared/browser";
import { budget } from "@orb/tooling/_shared/load-budget";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { resolveSessionAttach } from "../../snap/index.ts";
import type { Args, Recording, StepRun, TimedLine } from "../contract/types.ts";
import { MARKER_INIT_JS, runSteps } from "./drive.ts";

refuseDirectInvocation(import.meta.url, "pnpm record");

// A CEILING, load-scaled through the one policy (#1232): the literal is the quiet-box BASE.
const NAV_TIMEOUT_BASE_MS = 20_000;
const NAV_TIMEOUT_MS = budget(NAV_TIMEOUT_BASE_MS);
const TRAILING_SETTLE_MS = 900;
// The console channels a motion recording transcribes. `[perf]` = render-profiler's slow REACT
// COMMIT; the rest are the motion flagger pack's (motion-flaggers.ts + long-task-tracer.ts). Adding
// a channel there means adding it here — a tag nobody transcribes is invisible in the artifact this
// probe exists to produce.
const PERF_TAGS = ["[perf]", "[frame]", "[reflow]", "[input]", "[anim]", "[css]", "[drop]", "[space]", "[cls]"] as const;

interface Attached {
  readonly session: ProbeSession;
  readonly base: string;
}

/** #1285/#1289: `--session <name>` attaches to a live snap session's BROWSER (design §3.4/§5) rather than
 *  launching a fresh one — but record cannot reuse the session's live PAGE: `recordVideo` is only
 *  settable at Playwright's `newContext()` time, so `attachProbeSession` opens a brand-new context on the
 *  attached browser for it (`_shared/browser.ts`'s `attachRecordedContext`). A dead/foreign/absent
 *  session is an EXIT.toolError refusal (never a fallback launch).
 *
 *  #1289 fork (see ui-audit/ops/run.ts's fuller note): `opts.baseExplicit` distinguishes a named `--base`
 *  (composes, #1285) from the unset default, which falls back to the session's own bound URL (design
 *  §3.6) instead of `DEFAULT_BASE`. */
async function launchOrAttach(opts: Args, videoDir: string): Promise<Attached | ExitCode> {
  if (opts.session === null) {
    const session = await launchProbeSession({
      headless: true,
      viewport: opts.viewport,
      colorScheme: null,
      reducedMotion: false, // a motion probe wants the real animations
      localStorage: [],
      recordVideoDir: videoDir,
    });
    return { session, base: opts.base };
  }
  const attach = resolveSessionAttach(opts.session);
  if (!attach.ok) {
    print(attach.message);
    return EXIT.toolError;
  }
  const session = await attachProbeSession(attach.endpoint, { ...attach.environment, recordVideoDir: videoDir });
  return { session, base: opts.baseExplicit ? opts.base : attach.row.binding.url };
}

export async function recordVideo(opts: Args, outDir: string): Promise<Recording> {
  const videoDir = join(outDir, `.video-${opts.out}`);
  await rm(videoDir, { recursive: true, force: true });

  const attached = await launchOrAttach(opts, videoDir);
  if (typeof attached === "number") {
    // recordVideo's own return shape (Recording) has no exit-code leg; `ops/run.ts` already treats a
    // null videoPath as "no video produced" and exits 1 (non-zero, never a silent clean) — the refusal
    // message printed above explains WHY before that generic line prints. Returning `failures: -1`
    // (never a legitimate step-failure count) keeps the RESULT line's `step-failures=` honest that this
    // was a REFUSAL, not a run whose zero steps happened to succeed.
    return { videoPath: null, stepTimeline: [], clickTimes: [], perfLines: [], failures: -1, pageErrors: 0 };
  }
  const { session, base } = attached;
  const url = buildUrl(base, opts.route);
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
