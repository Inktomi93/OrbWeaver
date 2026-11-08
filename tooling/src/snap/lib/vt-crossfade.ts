// The vt-crossfade channel: per-frame opacity of every view-transition old/new snapshot in a --motion window,
// judged for a monotonic fade and its declared end state. The trace channels read no opacity, so a snapshot
// that returns to full opacity mid-fade is invisible to them.
import type { Page } from "@playwright/test";
import type { SnapAnalyzerProblem } from "../contract/analyzer.ts";
import type { CrossfadeEvidence, CrossfadeTrack } from "../contract/motion.ts";

const CROSSFADE_VERDICTS = ["unsupported", "none", "pass", "fail", "unjudged"] as const;
export type CrossfadeVerdict = (typeof CROSSFADE_VERDICTS)[number];

export interface CrossfadeJudgement {
  readonly verdict: CrossfadeVerdict;
  readonly problems: readonly SnapAnalyzerProblem[];
}

/** Computed opacity noise floor; a real return moves far more than this between frames. */
const CROSSFADE_OPACITY_EPSILON = 0.01;
/** A direction needs two readings. */
const MIN_JUDGED_SAMPLES = 2;

const SAMPLER_KEY = "__snapCrossfade";

// The page script wraps `document.startViewTransition` once per document and clears its records on every
// install, so a window reads only the transitions it started. Tracks come from the live animations at
// `ready`, so any capture name is sampled. A track stops at teardown: its animation goes `idle` there, and
// a computed read after teardown would report the element's own opacity, not the snapshot's.
const INSTALL_SAMPLER = `(() => {
  const key = ${JSON.stringify(SAMPLER_KEY)};
  const existing = globalThis[key];
  if (existing !== undefined) { existing.records.length = 0; return existing.supported; }
  const original = typeof document.startViewTransition === "function" ? document.startViewTransition.bind(document) : null;
  const state = { supported: original !== null, records: [] };
  globalThis[key] = state;
  if (original === null) return false;
  const snapshot = /^::view-transition-(old|new)\\(/u;
  document.startViewTransition = (update) => {
    const transition = original(update);
    const record = { outcome: "unfinished", tracks: [] };
    state.records.push(record);
    let done = false;
    transition.finished.then(() => { done = true; if (record.outcome === "unfinished") record.outcome = "finished"; }, () => { done = true; });
    transition.ready.then(() => {
      const start = performance.now();
      const live = document.getAnimations().flatMap((animation) => {
        const effect = animation.effect;
        const pseudo = effect === null ? null : effect.pseudoElement;
        if (typeof pseudo !== "string" || !snapshot.test(pseudo)) return [];
        const frames = effect.getKeyframes().filter((frame) => frame.opacity !== undefined);
        if (frames.length < 2) return [];
        const track = { pseudo, from: Number(frames[0].opacity), to: Number(frames[frames.length - 1].opacity), samples: [] };
        record.tracks.push(track);
        return [{ animation, track }];
      });
      const frame = () => {
        if (done) return;
        const t = performance.now() - start;
        for (const { animation, track } of live) {
          if (animation.playState === "idle") continue;
          track.samples.push({ t, opacity: Number(getComputedStyle(document.documentElement, track.pseudo).opacity) });
        }
        requestAnimationFrame(frame);
      };
      frame();
    }, () => { record.outcome = "skipped"; });
    return transition;
  };
  return true;
})()`;

const READ_SAMPLER = `(() => {
  const state = globalThis[${JSON.stringify(SAMPLER_KEY)}];
  return state === undefined ? { supported: false, transitions: [] } : { supported: state.supported, transitions: structuredClone(state.records) };
})()`;

/** Arm the sampler for one window; transitions started before this call are dropped. */
export async function installCrossfadeSampler(page: Page): Promise<void> {
  await page.evaluate(INSTALL_SAMPLER);
}

export async function readCrossfadeSamples(page: Page): Promise<CrossfadeEvidence> {
  return await page.evaluate<CrossfadeEvidence>(READ_SAMPLER);
}

type CrossfadeProblemRow = Pick<SnapAnalyzerProblem, "metric" | "subject" | "observed" | "threshold" | "detail">;

function problem(row: CrossfadeProblemRow): SnapAnalyzerProblem {
  return { arm: "motion", kind: "failure", ...row };
}

function round(value: number): string {
  return value.toFixed(2);
}

function trackProblems(track: CrossfadeTrack): SnapAnalyzerProblem[] {
  const direction = Math.sign(track.to - track.from);
  const problems: SnapAnalyzerProblem[] = [];
  const declared = `${round(track.from)}->${round(track.to)}`;
  for (let index = 1; index < track.samples.length; index += 1) {
    const before = track.samples[index - 1];
    const after = track.samples[index];
    if (before === undefined || after === undefined) {
      continue;
    }
    if ((after.opacity - before.opacity) * direction < -CROSSFADE_OPACITY_EPSILON) {
      problems.push(
        problem({
          metric: "vt-crossfade-opacity-return",
          subject: track.pseudo,
          observed: `${round(before.opacity)}->${round(after.opacity)} at ${Math.round(after.t).toString()}ms`,
          threshold: `monotonic ${declared}`,
          detail: `${track.pseudo} declares a fade ${declared} and its opacity moved back against it between frames: the snapshot flickers mid-transition.`,
        }),
      );
      break;
    }
  }
  const last = track.samples.at(-1);
  if (last !== undefined && Math.abs(last.opacity - track.to) > CROSSFADE_OPACITY_EPSILON) {
    problems.push(
      problem({
        metric: "vt-crossfade-end-state",
        subject: track.pseudo,
        observed: round(last.opacity),
        threshold: round(track.to),
        detail: `${track.pseudo} ended its transition at opacity ${round(last.opacity)}, not at its declared end ${round(track.to)}: the last painted frame jumps to the destination.`,
      }),
    );
  }
  return problems;
}

/** A finished transition is judged per snapshot track; a skipped or unfinished one, or a track with too few
 *  frames, is `unjudged` rather than clean. */
export function judgeCrossfade(evidence: CrossfadeEvidence): CrossfadeJudgement {
  if (!evidence.supported) {
    return { verdict: "unsupported", problems: [] };
  }
  if (evidence.transitions.length === 0) {
    return { verdict: "none", problems: [] };
  }
  const problems: SnapAnalyzerProblem[] = [];
  let judged = 0;
  for (const transition of evidence.transitions) {
    if (transition.outcome !== "finished") {
      continue;
    }
    for (const track of transition.tracks) {
      if (track.samples.length < MIN_JUDGED_SAMPLES) {
        continue;
      }
      judged += 1;
      problems.push(...trackProblems(track));
    }
  }
  if (problems.length > 0) {
    return { verdict: "fail", problems };
  }
  return { verdict: judged === 0 ? "unjudged" : "pass", problems };
}

/** The terminal block: the verdict, then one line per failed track. Empty when no window ran. */
export function crossfadeReportLines(evidence: CrossfadeEvidence | null): string[] {
  if (evidence === null) {
    return [];
  }
  const judgement = judgeCrossfade(evidence);
  return [
    `vt-crossfade ${judgement.verdict} · transitions ${String(evidence.transitions.length)}`,
    ...judgement.problems.map((row) => `[vt-crossfade] FAIL ${row.metric} ${row.subject} observed=${row.observed} threshold=${row.threshold}`),
  ];
}
