// Lanes 1 and 3 of the WORKBENCH — the SCORE readout and the ANALYZE verdict rails (program #102, mockup
// variant C). Both are the same thing: one stage's settled payload through the ONE renderer, under a
// numbered band, with that stage's own run control. So they are one component taking a stage, not two
// drawings that drift.
//
// (It replaces `stage-pane.tsx`, which existed because the surface showed ONE stage at a time behind a
// stepper and therefore needed a pane that could be any stage on any render. The workbench mounts three
// lanes at fixed stages; what survives is the payload dispatch, which is this file.)
//
// THE RAILS ARE NOT BOXES (chrome diet CD1). A read-only grouping gets a kicker and a hairline rule and
// nothing else — the accent, the border and the glow belong to whichever lane is the ONE focal. What the
// width buys here is DATA in reach, not two more frames.
//
// …WITH ONE MOVING EXCEPTION (#158 item 5, 2026-08-17): the SCORE lane wears the focal treatment while no
// score has landed, because at round 0 that is the step the user should take and the rewrite island beside
// it has nothing settled to emphasise. It is the same stripe+glow the island wears
// (`lib/focal-treatment.ts`), applied to this same `Section` rather than by re-wrapping it in a Card — the
// lane must not change ELEMENT as the pipeline advances, or the focal handing over would relayout the
// canvas under the user. CD1 is intact either way: at most one lane on the canvas is ever a box, and
// `lib/workbench-lanes.ts` is the single place that decides which.
//
// The renderer itself is unchanged and stays the whole point: fixed payloads render off the projected
// contracts + the built-in hint set; CUSTOM runs render off their EMBEDDED schema (P1-B, never a live row).
// The built-in look IS the general renderer applied to a hinted schema — if a custom renders poorly, the
// defect is in `PayloadView`, not here.

import type { RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { Section, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import type { Trpc } from "#data";
import { BUILTIN_STAGE_HINTS } from "../lib/builtin-hints.ts";
import { FOCAL_GLOW, FOCAL_STRIPE } from "../lib/focal-treatment.ts";
import { buildRenderPlan } from "../lib/render-plan.ts";
import { STAGE_NOT_RUN_COPY } from "../lib/stage-not-run-copy.ts";
import { LaneBand, LaneNotes } from "./lane-band.tsx";
import { PayloadView } from "./payload-view.tsx";

// Re-derived locally from the wire (§7.4 — never a hand-picked exported alias).
type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];

/** The fixed payloads' PROJECTED schemas — module-computed once (pure; the render plans derive off them). */
const FIXED_SCHEMAS: Record<RefineryStage, Record<string, unknown>> = {
  score: projectJsonSchema(REFINERY_STAGE_PAYLOADS.score),
  rewrite: projectJsonSchema(REFINERY_STAGE_PAYLOADS.rewrite),
  analyze: projectJsonSchema(REFINERY_STAGE_PAYLOADS.analyze),
};

/** The band's ordinal — the pipeline's own order, printed so the parallel canvas still reads as a sequence. */
const LANE_ORDINAL: Record<RefineryStage, string> = { score: "1", rewrite: "2", analyze: "3" };
const LANE_LABEL: Record<RefineryStage, string> = { score: "Score", rewrite: "Rewrite", analyze: "Analyze" };

export interface PayloadLaneProps {
  readonly stage: RefineryStage;
  readonly run: RunView | null;
  /** A call for THIS stage is in flight. Drives the plan-shaped skeleton on a first run and the dimmed
   *  shimmer on a re-run — and, critically, stops the not-run-yet arm from saying "nothing settled" at the
   *  exact moment something is being computed (side-eye 2026-08-09 P1-10: "running status lies"). */
  readonly running: boolean;
  /** The lane is showing a run the CONTEXT ledger pinned (§16.1). */
  readonly viewingBack: boolean;
  /** Why this lane's payload no longer answers the pipeline beside it, or null. */
  readonly behind: string | null;
  readonly onBackToLatest: () => void;
  /** This lane's run LANDED from a mutation the surface just made — the hero gauge's arrival signal
   *  (`useCountUp`'s `arrived`; a session merely opened must not animate). @defaultValue false */
  readonly arrived?: boolean;
  /** The lane's own run control (fit line · Run/Re-run · the §8 warn) — composed by the surface. */
  readonly runControl?: ReactNode;
  /** This lane is carrying the canvas's ONE focal treatment right now (CD3 — derived in
   *  `lib/workbench-lanes.ts`, never decided here). @defaultValue false */
  readonly focal?: boolean;
}

/** The three body arms, as a total dispatch (never nested ternaries in the JSX). */
function LaneBody({ stage, run, running, arrived }: { stage: RefineryStage; run: RunView | null; running: boolean; arrived: boolean }): ReactElement {
  if (run !== null) {
    const custom = run.payloadConfig.kind === "custom";
    const schema = custom ? (run.payloadConfig as { schema: Record<string, unknown> }).schema : FIXED_SCHEMAS[run.stage];
    const plan = buildRenderPlan(schema, custom ? {} : BUILTIN_STAGE_HINTS[run.stage]);
    return <PayloadView arrived={arrived} payload={run.payload as Record<string, unknown>} pending={running} plan={plan} />;
  }
  if (running) {
    // No plan to shape a skeleton from on a first run (the plan comes off the run's own payload config), so
    // this is the honest minimum: the stage's teaching copy replaced by what is actually happening.
    return (
      <Stack aria-busy={true} gap="row">
        <Text voice="label">Running {stage}…</Text>
        <Skeleton className="h-control-lg w-full" />
        <Skeleton className="h-control-md w-full" />
        <Skeleton className="h-control-md w-2/3" />
      </Stack>
    );
  }
  return (
    <Stack gap="tight">
      <Text voice="label">Nothing settled for {stage} yet</Text>
      <Text voice="gloss">{STAGE_NOT_RUN_COPY[stage]}</Text>
    </Stack>
  );
}

export function PayloadLane({
  stage,
  run,
  running,
  viewingBack,
  behind,
  onBackToLatest,
  arrived = false,
  runControl,
  focal = false,
}: PayloadLaneProps): ReactElement {
  // `data-lane` rather than a per-stage testid: the registry is a fixed key set and a stage-templated id
  // would be invisible to both the typed-testid gate and the liveness lens. A CT scopes by `[data-lane=…]`.
  return (
    <Section
      aria-label={LANE_LABEL[stage]}
      className={focal ? `gap-row rounded-(--radius-base) p-row ${FOCAL_GLOW}` : "gap-row"}
      data-focal={focal ? "true" : undefined}
      data-lane={stage}
      {...(focal ? { style: FOCAL_STRIPE } : {})}
    >
      <LaneBand kicker={`${LANE_ORDINAL[stage]} · ${LANE_LABEL[stage]}`} />
      {runControl}
      <LaneNotes behind={behind} iteration={run?.iteration ?? null} onBackToLatest={onBackToLatest} viewingBack={viewingBack} />
      <LaneBody arrived={arrived} run={run} running={running} stage={stage} />
    </Section>
  );
}
