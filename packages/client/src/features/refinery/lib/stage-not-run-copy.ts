// The workbench lanes' NOT-RUN-YET copy — one home, because the two lane components were printing the
// SAME sentence from two places (`payload-lane.tsx`'s `NOT_RUN_COPY.rewrite` and `rewrite-lane.tsx`'s
// inline string were byte-identical, and only one of them got fixed when the sentence was found to be
// wrong). #158 is a one-home issue; this is one of its findings, three files over.
//
// ── THE REWRITE LINE USED TO CLAIM A PRECONDITION THE DOMAIN DOES NOT HAVE (#158 item 4) ────────────
// It read "Run the rewrite (or hand-edit) once a score exists", which reads as a rule. It is not one.
// `assertStageReady` (`packages/server/src/domain/refinery/verbs/run-stage.ts`) refuses exactly one cold
// case — an analyze with no rewrite — and `dispatchRewrite` passes `prior.score?.payload ?? null`, so a
// cold rewrite runs, ungrounded. The owner's screenshot caught the consequence: an enabled-looking Run
// button beside a caption stating a precondition it ignored. The issue offered two arms — make it
// genuinely runnable, or gate it — and for REWRITE the honest one is that the caption lied, because
// disabling it would be the client imposing a stricter contract than the domain's. ANALYZE's line stays
// as written: its precondition is real, and it is now enforced in the UI too (`LaneRunControl.blocked`,
// derived in `workbench-lanes.ts` off that same `assertStageReady`).

import type { RefineryStage } from "@orb/contracts/refinery";

/** What a lane says while its stage has never settled — the stage's own next step, in the user's terms. */
export const STAGE_NOT_RUN_COPY: Record<RefineryStage, string> = {
  score: "Run the score to get a per-field critique with a 1-10 and what to fix.",
  rewrite: "Run the rewrite (or hand-edit) any time — with a score in hand it rewrites against that critique, without one it works from the card alone.",
  analyze: "Analyze compares the latest rewrite against your original — run a rewrite first.",
};
