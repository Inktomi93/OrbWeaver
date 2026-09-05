// snap/lib/motion-gaps — the motion arm's evidence GAPS and its load LABEL, pure over the rate posture and the
// argv-ordered action queue. Split out of ops/arms/motion.ts at the tooling-size cap (Core-Tooling-Law §4.3) when
// #1616 turned load from a gap into a label; nothing here touches a browser or a file.
import type { EvidenceGap } from "../../_shared/evidence.ts";
import type { SnapAction } from "../contract/actions.ts";
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
