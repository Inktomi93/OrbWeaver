// The vt-crossfade channel: per-frame opacity of every view-transition old/new snapshot in a --motion window,
// judged for a monotonic fade and its declared end state. The trace channels read no opacity, so a snapshot
// that returns to full opacity mid-fade is invisible to them.
import type { Page } from "@playwright/test";
import type { EvidenceGap } from "../../floor/verdict/evidence.ts";
import type { SnapAnalyzerProblem } from "../contract/analyzer.ts";
import type { CrossfadeEvidence, CrossfadeTrack, CrossfadeTransition } from "../contract/motion.ts";

const CROSSFADE_VERDICTS = ["unsupported", "none", "pass", "fail", "unjudged"] as const;
type CrossfadeVerdict = (typeof CROSSFADE_VERDICTS)[number];

export interface CrossfadeJudgement {
  readonly verdict: CrossfadeVerdict;
  readonly problems: readonly SnapAnalyzerProblem[];
}

/** Computed opacity noise floor; a real return moves far more than this between frames. */
const CROSSFADE_OPACITY_EPSILON = 0.01;
/** A direction needs two readings. */
const MIN_JUDGED_SAMPLES = 2;

const SAMPLER_KEY = "__snapCrossfade";

// The page script wraps `document.startViewTransition` for one window and the read puts the page's own function
// back. It never attaches a handler to the transition's promises: a handler marks a rejection handled, and the
// page's own unhandled "Transition was skipped" must still reach page-errors. Each transition is followed per
// rAF through `document.activeViewTransition` and its snapshot animations instead. A transition that leaves
// `activeViewTransition` with every snapshot animation `finished` on its last frame ran to its end; one that
// leaves mid-fade was interrupted by a later transition or `skipTransition()`.
const INSTALL_SAMPLER = `(() => {
  const key = ${JSON.stringify(SAMPLER_KEY)};
  if (globalThis[key] !== undefined) globalThis[key].restore();
  const hadOwn = Object.prototype.hasOwnProperty.call(document, "startViewTransition");
  const previous = document.startViewTransition;
  const supported = typeof previous === "function" && "activeViewTransition" in document;
  const state = { supported, records: [], closed: false, restore: () => {} };
  globalThis[key] = state;
  if (!supported) return false;
  state.restore = () => {
    state.closed = true;
    if (hadOwn) document.startViewTransition = previous;
    else delete document.startViewTransition;
    delete globalThis[key];
  };
  const snapshot = /^::view-transition-(old|new)\\(/u;
  const discover = (record) => document.getAnimations().flatMap((animation) => {
    const effect = animation.effect;
    const pseudo = effect === null ? null : effect.pseudoElement;
    if (typeof pseudo !== "string" || !snapshot.test(pseudo)) return [];
    const frames = effect.getKeyframes().filter((frame) => frame.opacity !== undefined);
    if (frames.length < 2) return [];
    const track = { pseudo, from: Number(frames[0].opacity), to: Number(frames[frames.length - 1].opacity), samples: [] };
    record.tracks.push(track);
    return [{ animation, track }];
  });
  document.startViewTransition = function (...args) {
    const transition = previous.apply(document, args);
    const record = { outcome: "unfinished", tracks: [] };
    state.records.push(record);
    let live = null;
    let start = 0;
    let endedFinished = false;
    const frame = () => {
      if (state.closed) return;
      const active = document.activeViewTransition === transition;
      if (!active) {
        record.outcome = live === null ? "skipped" : endedFinished ? "finished" : "interrupted";
        return;
      }
      if (live === null) {
        const found = discover(record);
        if (found.length > 0) { live = found; start = performance.now(); }
      }
      if (live !== null) {
        const t = performance.now() - start;
        for (const { animation, track } of live) {
          if (animation.playState === "idle") continue;
          track.samples.push({ t, opacity: Number(getComputedStyle(document.documentElement, track.pseudo).opacity) });
        }
        endedFinished = live.every(({ animation }) => animation.playState === "finished");
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return transition;
  };
  return true;
})()`;

const READ_AND_RESTORE = `(() => {
  const state = globalThis[${JSON.stringify(SAMPLER_KEY)}];
  if (state === undefined) return { supported: false, transitions: [] };
  state.restore();
  return { supported: state.supported, transitions: structuredClone(state.records) };
})()`;

/** Arm the sampler for one window; a sampler a crashed window left behind is restored first. */
export async function installCrossfadeSampler(page: Page): Promise<void> {
  await page.evaluate(INSTALL_SAMPLER);
}

/** Read the window's samples and put the page's own `startViewTransition` back. */
export async function readCrossfadeSamples(page: Page): Promise<CrossfadeEvidence> {
  return await page.evaluate<CrossfadeEvidence>(READ_AND_RESTORE);
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

// The tracks of one transition the judge can read, and how many it had to leave unseen.
function tallyTransition(transition: CrossfadeTransition): { readonly judged: readonly CrossfadeTrack[]; readonly unseen: number } {
  if (transition.outcome === "unfinished" || transition.outcome === "interrupted") {
    return { judged: [], unseen: 1 };
  }
  const tracks = transition.outcome === "finished" ? transition.tracks : [];
  const judged = tracks.filter((track) => track.samples.length >= MIN_JUDGED_SAMPLES);
  return { judged, unseen: tracks.length - judged.length };
}

/** A finished transition is judged per snapshot track. A skipped one never faded, so it is not judged. An
 *  unfinished or interrupted one, or a track with too few frames, leaves the window `unjudged` unless another
 *  transition was judged: a fade the channel could not see to its end is not a clean one. */
export function judgeCrossfade(evidence: CrossfadeEvidence): CrossfadeJudgement {
  if (!evidence.supported) {
    return { verdict: "unsupported", problems: [] };
  }
  const problems: SnapAnalyzerProblem[] = [];
  let judged = 0;
  let unseen = 0;
  for (const transition of evidence.transitions) {
    const tally = tallyTransition(transition);
    judged += tally.judged.length;
    unseen += tally.unseen;
    problems.push(...tally.judged.flatMap(trackProblems));
  }
  if (problems.length > 0) {
    return { verdict: "fail", problems };
  }
  if (judged > 0) {
    return { verdict: "pass", problems };
  }
  return { verdict: unseen > 0 ? "unjudged" : "none", problems };
}

/** An `unjudged` window started a fade the channel could not judge, so the motion run cannot claim it. */
export function crossfadeGaps(evidence: CrossfadeEvidence): EvidenceGap[] {
  if (judgeCrossfade(evidence).verdict !== "unjudged") {
    return [];
  }
  const outcomes = evidence.transitions.map((transition) => transition.outcome).join(", ");
  return [
    {
      evidence: "a judged view-transition crossfade",
      detail: `the window started ${String(evidence.transitions.length)} view transition(s) (${outcomes}) and none ran to its end with enough frames to judge the fade. An unfinished transition needs a longer --motion-window; an interrupted one was superseded by a later transition or skipTransition().`,
    },
  ];
}

/** The terminal block: the verdict, then one line per failed track. Empty when no window ran. */
export function crossfadeReportLines(evidence: CrossfadeEvidence | null): string[] {
  if (evidence === null) {
    return [];
  }
  const judgement = judgeCrossfade(evidence);
  return [
    `vt-crossfade ${judgement.verdict} · transitions ${String(evidence.transitions.length)} (${evidence.transitions.map((transition) => transition.outcome).join(", ")})`,
    ...judgement.problems.map((row) => `[vt-crossfade] FAIL ${row.metric} ${row.subject} observed=${row.observed} threshold=${row.threshold}`),
  ];
}
