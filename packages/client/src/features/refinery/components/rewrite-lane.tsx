// Lane 2 of the WORKBENCH — the REWRITE island (program #102, mockup variant C). The widest lane, and the
// surface's focal element WHENEVER a score exists, because from that point the accept work is the decision
// the user came to make. Score and analyze recede to kickers and hairlines on either side of it.
//
// ── THE FOCAL IS NOW A PROP, NOT THIS FILE'S PROPERTY (#158 item 5, 2026-08-17) ──────────────────────
// The stripe + glow used to be declared here and applied unconditionally, i.e. the island WAS the focal in
// every state. At round 0 that put the canvas's one emphasised box on a lane whose own body says "nothing
// settled for rewrite yet", while 1 · SCORE — the step to take — sat in a plain rail. CD3 is one focal
// that POINTS WHERE THE USER SHOULD GO, so it has to move; `lib/workbench-lanes.ts` decides which lane
// wears it (score until a score lands, this island thereafter — never analyze, which is a readout) and
// `lib/focal-treatment.ts` is the treatment both lanes share.
//
// ── …AND UN-FOCAL IT IS NOT A CARD EITHER (side-eye 2026-08-19 P2) ───────────────────────────────────
// The line above used to end "un-focal, this stays a `Card`: it holds the widest content on the canvas and
// a plain card is not an emphasis, it is a container." On a canvas of three lanes that produced three
// different container treatments — two kickered rails and one boxed lane — with the box on the lane that
// was NOT focal, which is the same inversion #158 item 5 fixed for the stripe. The surface's own law is
// its INSTRUMENT tier (`refinery-content-surface.tsx`: "its islands resolve the dense steps and its rails
// are kickers + hairlines, not boxes"), and CD1 is at most ONE box on the canvas — the focal's. So this is
// the same `Section` `PayloadLane` renders, with the same focal treatment applied to that same element:
// three lanes, one anatomy, and the emphasis is the only thing that ever differs. Changing ELEMENT as the
// pipeline advances is what the payload lane's header forbids, and this now does not.
//
// IT ALSO GAINS THE REGION LANDMARK the other two lanes had (the `aria-label`ed `Section`): the widest,
// most interactive lane on the canvas was the one a landmark walk could not reach.
//
// THE LANE STATES ITS OWN LIFE: not-run-yet says WHY (the stage-order rule the server enforces), a call in
// flight replaces that with what is happening, a walked-back run says superseded and offers the way home,
// and a rewrite the pipeline has moved past says so rather than sitting fresh-looking beside a newer score.

import type { CompareDecision } from "@orb/ui/compare-blocks";
import { Section, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import type { Trpc } from "#data";
import { testId } from "#lib";
import { FOCAL_GLOW, FOCAL_STRIPE } from "../lib/focal-treatment.ts";
import { DROP_REASON_COPY } from "../lib/reason-copy.ts";
import type { ReviewEntry } from "../lib/review-entries.ts";
import { reviewTargetLabel } from "../lib/review-entries.ts";
import { STAGE_NOT_RUN_COPY } from "../lib/stage-not-run-copy.ts";
import { AcceptReview } from "./accept-review.tsx";
import { LaneBand, LaneNotes, RunModelCredit } from "./lane-band.tsx";
import { RefineryChip } from "./refinery-chip.tsx";

// Re-derived locally from the wire (§7.4 — never a hand-picked exported alias).
type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];
/** EXACTLY what the lane reads off a run — its round, its stage, and the provenance and model the band prints. The
 *  reviewable ENTRIES arrive separately (the surface joins the payload against the live card and the
 *  session pin, which is not this component's job), so taking the whole row here would be asking callers
 *  for a payload the lane never opens. Derived from the wire, never re-spelled. */
type RewriteRunView = Pick<RunView, "iteration" | "model" | "payloadConfig" | "stage">;

export interface RewriteLaneProps {
  readonly run: RewriteRunView | null;
  readonly entries: readonly ReviewEntry[];
  /** Entries the apply verb would refuse whatever is decided (`ReviewEntry.refusal`) — shown with the
   *  reason, never offered a Keep. @defaultValue [] */
  readonly unapplicable?: readonly ReviewEntry[];
  readonly decided: readonly CompareDecision[];
  readonly onDecide: (index: number, decision: CompareDecision) => void;
  /** A rewrite call is in flight (a bare `runStage`, or the rewrite half of an `iterate` round). */
  readonly running: boolean;
  /** The lane is showing a run the CONTEXT ledger pinned (§16.1). */
  readonly viewingBack: boolean;
  /** Why this rewrite no longer answers the pipeline beside it, or null. */
  readonly behind: string | null;
  readonly onBackToLatest: () => void;
  /** The lane's own run control (fit line · Re-run rewrite · the §8 warn) — composed by the surface. */
  readonly runControl: ReactNode;
  /** This lane is carrying the canvas's ONE focal treatment right now (CD3 — derived in
   *  `lib/workbench-lanes.ts`, never decided here). */
  readonly focal: boolean;
}

/** The provenance word on the lane's band: the F4 mode a model ran under, or the hand-authored arm. */
function provenanceOf(run: RewriteRunView | null): string | null {
  if (run === null) {
    return null;
  }
  const config = run.payloadConfig;
  if ("mode" in config) {
    return config.mode;
  }
  return config.kind === "manual" ? "hand-authored" : "custom";
}

/** The entries the rewrite produced that cannot land on the live card, each with the verb's own reason. */
function UnapplicableEntries({ entries }: { entries: readonly ReviewEntry[] }): ReactElement | null {
  if (entries.length === 0) {
    return null;
  }
  return (
    <Stack data-testid={testId("refineryUnapplicable")} gap="tight">
      <Text voice="kicker">Not applicable to this card</Text>
      {entries.map((review) => {
        const copy = review.refusal === undefined ? null : DROP_REASON_COPY[review.refusal];
        return copy === null ? null : (
          <Stack gap="tight" key={review.payloadIndex}>
            <Text voice="label">
              {reviewTargetLabel(review.entry)} <RefineryChip tone={copy.tone}>{copy.chip}</RefineryChip>
            </Text>
            <Text voice="gloss">{copy.why}</Text>
          </Stack>
        );
      })}
    </Stack>
  );
}

/** The lane's body, in its three arms. A total dispatch in one function rather than nested ternaries in the
 *  JSX: the not-run arm states WHY (the stage-order rule the server enforces) instead of a bare empty box,
 *  and the in-flight arm replaces that copy with what is happening — there is no payload to shape a
 *  skeleton from on a first run, so this is the honest minimum. */
function RewriteBody({
  settled,
  running,
  entries,
  decided,
  onDecide,
}: {
  settled: boolean;
  running: boolean;
  entries: readonly ReviewEntry[];
  decided: readonly CompareDecision[];
  onDecide: (index: number, decision: CompareDecision) => void;
}): ReactElement {
  if (settled) {
    return <AcceptReview decided={decided} entries={entries} onDecide={onDecide} />;
  }
  if (running) {
    return (
      <Stack aria-busy={true} gap="row">
        <Text voice="label">Running rewrite…</Text>
        <Skeleton className="h-control-lg w-full" />
        <Skeleton className="h-control-md w-full" />
        <Skeleton className="h-control-md w-2/3" />
      </Stack>
    );
  }
  return (
    <Stack gap="tight">
      <Text voice="label">Nothing settled for rewrite yet</Text>
      {/* ONE HOME (#158, `lib/stage-not-run-copy.ts`). This sentence used to be spelled here AND in
          `payload-lane.tsx`'s own table, byte-identical — so when it turned out to state a precondition
          the domain does not have, only one of the two got corrected. */}
      <Text voice="gloss">{STAGE_NOT_RUN_COPY.rewrite}</Text>
    </Stack>
  );
}

export function RewriteLane({
  run,
  entries,
  unapplicable = [],
  decided,
  onDecide,
  running,
  viewingBack,
  behind,
  onBackToLatest,
  runControl,
  focal,
}: RewriteLaneProps): ReactElement {
  const kept = decided.filter((d) => d === true).length;
  const discarded = decided.filter((d) => d === false).length;
  const undecided = entries.length - kept - discarded;
  const provenance = provenanceOf(run);
  const settled = run !== null && run.stage === "rewrite";
  return (
    <Section
      aria-label="Rewrite"
      className={focal ? `gap-row rounded-(--radius-base) p-row ${FOCAL_GLOW}` : "gap-row"}
      data-focal={focal ? "true" : undefined}
      data-lane="rewrite"
      data-testid={testId("refineryRewriteLane")}
      {...(focal ? { style: FOCAL_STRIPE } : {})}
    >
      <Stack gap="row">
        <LaneBand kicker={provenance === null ? "2 · Rewrite" : `2 · Rewrite · ${provenance}`}>
          {settled ? (
            <>
              <RefineryChip tone="good">{kept} kept</RefineryChip>
              <RefineryChip tone="bad">{discarded} discarded</RefineryChip>
              <RefineryChip tone="warn">{undecided} undecided</RefineryChip>
              <RunModelCredit model={run.model} />
            </>
          ) : null}
        </LaneBand>
        {runControl}
        <LaneNotes behind={behind} iteration={run?.iteration ?? null} onBackToLatest={onBackToLatest} viewingBack={viewingBack} />
        <RewriteBody decided={decided} entries={entries} onDecide={onDecide} running={running} settled={settled} />
        {settled ? <UnapplicableEntries entries={unapplicable} /> : null}
      </Stack>
    </Section>
  );
}
