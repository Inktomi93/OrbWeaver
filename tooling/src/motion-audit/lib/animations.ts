// Animation-owner verdict policy. The browser bridge supplies raw target state and mechanism; this file
// revalidates the only library-owned allowance before it can leave the dirty budget. Raw populations are
// never rewritten, and old bundles without attribution remain ordinary unattributed failures.
//
// TWO POPULATIONS, ONE POLICY (#1070). The bridge answers two DIFFERENT questions and the budget needs
// both:
//   · ACTIVE — `__orb.animations()`, a `document.getAnimations()` SAMPLE taken when the measured window
//     closes. It answers "what is STILL RUNNING", i.e. continuous loops. It structurally CANNOT answer
//     the other question: every house duration is 130/220/360ms (guide §2) and the default window is
//     2,500ms, so a dirty transition launched by the measured click finished ~2s before the sample.
//     Judged alone, the dirty-animation budget was a continuous-loop detector whose entire
//     `sanctionedLibrary` machinery adjudicated a population that could not contain the transitions it
//     exists to sanction.
//   · TRANSIENT — the `anim` channel of `__orb.flags()`, raised at `animationstart`/`transitionstart`
//     and carrying the SAME `AnimationRecord` facts, captured at launch. It answers "what FIRED inside
//     the window". Checkpoint-scoped, so it is exactly the measured window's raises.
// The verdict policy below is UNCHANGED and applied to both. In particular the flag's own `overBudget`
// (guide §3.7's console verdict) is never read: #1069's allowance fork is open on that channel, and
// consuming a verdict instead of the facts would import the fork into this tool's exit code.
//
// The two populations OVERLAP — a dirty animation that started inside the window and is still running at
// the sample appears in both — so the budgeted count deduplicates on target+property identity. Without
// that, one loop would be reported as two offenders.

import { baseUiAttributionMismatch, isSanctionedLibraryAnimation } from "@orb/kit/motion-allowance";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import type { AnimationRecord, MotionFlagRecord } from "../contract/types.ts";

/** The allowance POLICY is not decided here any more (#1069): `@orb/kit/motion-allowance` is its one home,
 *  shared with the console `[anim]` flagger that judges the same launches on the push side — two copies of
 *  this table is exactly how the two instruments came to disagree about ratified behaviour. What stays
 *  tooling-side is the wrapper: the same attribution contradiction, expressed as THIS tool's `EvidenceGap`. */
function baseUiAttributionGap(animation: AnimationRecord): EvidenceGap | null {
  const detail = baseUiAttributionMismatch(animation);
  return detail === null ? null : { evidence: "Base UI animation attribution", detail };
}

export interface AnimationTotals {
  /** Not compositor-clean in the ACTIVE end-of-window sample. */
  readonly rawDirty: number;
  /** Not compositor-clean among the TRANSIENT raises — the population a sampler cannot see (#1070). */
  readonly transientDirty: number;
  readonly sanctionedLibrary: number;
  /** The deduplicated union of both populations, minus the #953 allowance — what the budget judges. */
  readonly budgetedDirty: number;
  readonly gaps: readonly EvidenceGap[];
}

/** The cross-population dedupe identity: a dirty animation that STARTED inside the window and is STILL
 *  RUNNING at the end-of-window sample is observed twice and is ONE offender. Target + property set —
 *  the flagger's own console dedupe key, so the two instruments count the same way. Applied ONLY across
 *  the two populations, never within one: two distinct lifecycle launches on the same panel (a
 *  starting-style open and an ending-style close) are two real animations. */
function animationIdentity(animation: AnimationRecord): string {
  return `${animation.target}|${[...animation.properties].sort().join(",")}`;
}

/** The `anim` raises' launch-time records. A raise WITHOUT one cannot be sanctioned — the allowance needs
 *  the property set and the bound lifecycle — so it is synthesized as an unattributed dirty animation
 *  rather than dropped: the same posture this file already takes for a pre-#953 `AnimationRecord`
 *  ("old bundles without attribution remain ordinary unattributed failures"), and the opposite of the
 *  clean zero a filter would produce. */
function transientAnimations(flags: readonly MotionFlagRecord[]): readonly AnimationRecord[] {
  return flags.filter((flag) => flag.tag === "anim").map((flag) => flag.animation ?? { target: flag.offender, properties: [], compositorClean: false });
}

/** Raw/transient/classified/budgeted animation populations plus fail-loud attribution contradictions.
 *  `flags` defaults to empty so a caller with no transient evidence keeps the pre-#1070 arithmetic
 *  EXACTLY — the active population's numbers are untouched by this change. */
export function animationTotals(animations: readonly AnimationRecord[], flags: readonly MotionFlagRecord[] | null = []): AnimationTotals {
  const activeDirty = animations.filter((animation) => !animation.compositorClean);
  const activeIdentities = new Set(activeDirty.map(animationIdentity));
  const transient = transientAnimations(flags ?? []);
  const transientDirty = transient.filter((animation) => !animation.compositorClean);
  // Only the transients the sample did NOT already report can add to the budget.
  const novelTransient = transientDirty.filter((animation) => !activeIdentities.has(animationIdentity(animation)));
  const judged = [...activeDirty, ...novelTransient];
  const sanctionedLibrary = judged.filter(isSanctionedLibraryAnimation).length;
  return {
    rawDirty: activeDirty.length,
    transientDirty: transientDirty.length,
    sanctionedLibrary,
    budgetedDirty: judged.length - sanctionedLibrary,
    gaps: [...animations, ...transient].map(baseUiAttributionGap).filter((gap): gap is EvidenceGap => gap !== null),
  };
}
