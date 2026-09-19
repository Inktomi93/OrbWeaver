// snap/lib/motion-gaps — the motion arm's evidence GAPS and its load LABEL, pure over the rate posture and the
// argv-ordered action queue. Split out of ops/arms/motion.ts at the tooling-size cap (Core-Tooling-Law §4.3) when
// #1616 turned load from a gap into a label; nothing here touches a browser or a file.
import type { EvidenceGap } from "../../_shared/evidence.ts";
import type { SnapAction, Step } from "../contract/actions.ts";
import type { Args } from "../contract/types.ts";
import type { SnapRatePosture } from "./rate-posture.ts";
import { ratePostureDisposition } from "./rate-posture.ts";

/** LOAD IS NO LONGER A GAP (#1616). An evidence gap says "this run could not measure", which reddens the
 *  arm — and a loaded box now MEASURES. So only the acceleration arm (a browser that produces no
 *  meaningful rate at all) still yields a gap; the load reading rides `motionLoadSuspect` below, which
 *  labels the numbers instead of suppressing them. */
export function rateEvidenceGaps(ratePosture: SnapRatePosture): EvidenceGap[] {
  const disposition = ratePostureDisposition(ratePosture, "Snap motion rates");
  if (disposition.disposition !== "withheld") {
    return [];
  }
  return [{ evidence: "hardware browser acceleration", detail: disposition.reason }];
}

/** The label half: non-null when this run's motion numbers were measured on a loaded box, so the arm can
 *  print `motion=load-suspect` and annotate without any of them becoming a verdict. */
export function motionLoadSuspect(ratePosture: SnapRatePosture): string | null {
  const disposition = ratePostureDisposition(ratePosture, "Snap motion rates");
  return disposition.disposition === "load-suspect" ? disposition.reason : null;
}

/** How many later queue entries the hint names before it stops listing them. */
const MOTION_QUEUE_HINT_ENTRIES = 3;

function actionLabel(entry: SnapAction): string {
  return entry.type === "eval" ? "--eval" : `--${entry.action.kind}`;
}

/** THE QUEUE POSITION, SAID OUT LOUD (#1385 item 1). `pnpm snap / --goto chats --motion '[sel]' --open-chat X`
 *  measures the surface that exists BEFORE `--open-chat` runs, because snap's action queue is argv-ordered
 *  and `--motion` takes its position in it like every other step. The measurement is therefore correct and
 *  the refusal ("nothing composited") is correct — and neither says the thing the operator needs, which is
 *  that they wrote the flag too early. This is not a misuse to reject at parse time: measuring a surface
 *  and THEN navigating away is legitimate. It is a hint, and only on a run that already has a gap. */
export function motionQueueHint(opts: Args, actionIndex: number): EvidenceGap | null {
  const later = opts.actions.slice(actionIndex + 1).filter((entry) => entry.type !== "eval");
  if (later.length === 0) {
    return null;
  }
  const shown = later.slice(0, MOTION_QUEUE_HINT_ENTRIES).map(actionLabel);
  const omitted = later.length - shown.length;
  return {
    evidence: "a settled surface to measure",
    detail: `--motion ran at queue position ${String(actionIndex + 1)} of ${String(opts.actions.length)}, and ${String(later.length)} nav/step action(s) follow it (${shown.join(", ")}${omitted > 0 ? `, +${String(omitted)} more` : ""}) — snap runs the queue in ARGV ORDER, so the window opened on the surface those actions had not reached yet. Write --motion after the last nav/step if you meant to measure the destination.`,
  };
}

/** Which step kinds DISPATCH INPUT, as a mapped Record so a new `Step` kind cannot be added without
 *  classifying it here (Spine §5.5). `motion-click` is excluded because it IS the measured window's own
 *  input; `waitfor`/`pause` dispatch nothing. */
const DISPATCHES_INPUT: Record<Step["kind"], boolean> = {
  click: true,
  "drop-files": true,
  fill: true,
  hover: true,
  jsclick: true,
  key: true,
  keyboard: true,
  "motion-click": false,
  pause: false,
  press: true,
  upload: true,
  waitfor: false,
  wheel: true,
  wheelburst: true,
};

/** THE INPUT THAT RAN BEFORE THE WINDOW OPENED (#2439). `--wheel-burst <sel>=100:10 --motion` reads as
 *  "measure that burst" and measures the opposite: `--motion` takes its own argv position like every other
 *  step, and a SELECTOR-LESS window opens after the reach actions AND after `__orb.resetEvidence()`
 *  (ops/arms/motion.ts calls that reset "post-reach evidence reset" in as many words). The burst's frames
 *  are therefore discarded by construction and the run reports `frames-raw=0/0 measured-input=0` plus a
 *  frame-population refusal — an EMPTY window, which reads exactly like a smooth one.
 *
 *  SAME SHAPE AND SAME RULING AS `motionQueueHint` ABOVE, deliberately: NOT a parse-time refusal. Wheeling
 *  to load more rows and then measuring the window their arrival animates is a legitimate run, so rejecting
 *  the combination would delete a real capability to fix a misread. It is a hint, and only on a run that
 *  already has a gap — and it names the arm that DOES answer "is this input slow": `--perf`, whose per-step
 *  tape brackets each reach action, or `--cpu-profile` for the self time under it.
 *
 *  Selector-bearing `--motion <sel>` is exempt: that window dispatches its own trusted click INSIDE the
 *  trace, so the operator asked for a different measurement and the preceding input really is reach. */
export function motionPrecedingInputHint(opts: Args, actionIndex: number, selector: string | null): EvidenceGap | null {
  if (selector !== null) {
    return null;
  }
  const inputs = opts.actions.slice(0, actionIndex).filter((entry) => entry.type === "step" && DISPATCHES_INPUT[entry.action.kind]);
  if (inputs.length === 0) {
    return null;
  }
  const shown = inputs.slice(-MOTION_QUEUE_HINT_ENTRIES).map(actionLabel);
  return {
    evidence: "the measured input",
    detail: `${String(inputs.length)} input action(s) ran BEFORE this window opened (${shown.join(", ")}) and --motion was written with no selector, so the window is the post-reach entry window: snap settles the flaggers and calls __orb.resetEvidence() before it starts, which DISCARDS every frame those inputs caused. This window says nothing about them — frames-raw 0/0 here is an empty measurement, not a smooth one. To measure an input's own cost use --perf (per-step LoAF/EventTiming attribution across the whole tape) or --cpu-profile for self time; to measure a click's window give --motion that selector so the click is dispatched inside the trace.`,
  };
}
