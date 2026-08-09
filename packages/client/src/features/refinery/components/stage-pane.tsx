// The CONTENT stage pane (extracted from the surface under the component-size cap): the settled payload
// through the ONE renderer — fixed payloads render off the projected contracts + the built-in hint set;
// CUSTOM runs render off their EMBEDDED schema (P1-B, never a live row). The rewrite pane is the accept
// review instead of a payload dump; the not-run-yet arm states WHY (the stage-order rule the server
// enforces), never a bare disabled pane.

import type { RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { Card } from "@orb/ui/card";
import type { CompareDecision } from "@orb/ui/compare-blocks";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { BUILTIN_STAGE_HINTS } from "../lib/builtin-hints.ts";
import { buildRenderPlan } from "../lib/render-plan.ts";
import type { ReviewEntry } from "../lib/review-entries.ts";
import { AcceptReview } from "./accept-review.tsx";
import { PayloadView } from "./payload-view.tsx";
import { RefineryChip } from "./refinery-chip.tsx";

// Re-derived locally from the wire (§7.4 — never a hand-picked exported alias).
type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];

/** The fixed payloads' PROJECTED schemas — module-computed once (pure; the render plans derive off them). */
const FIXED_SCHEMAS: Record<RefineryStage, Record<string, unknown>> = {
  score: projectJsonSchema(REFINERY_STAGE_PAYLOADS.score),
  rewrite: projectJsonSchema(REFINERY_STAGE_PAYLOADS.rewrite),
  analyze: projectJsonSchema(REFINERY_STAGE_PAYLOADS.analyze),
};

/** The not-run-yet arm's WHY, per stage (the stage-order rule the server enforces, stated). */
const NOT_RUN_COPY: Record<RefineryStage, string> = {
  score: "Run the score to get a per-field critique with a 1-10 and what to fix.",
  rewrite: "Run the rewrite (or hand-edit) once a score exists — only the scoped fields are touched.",
  analyze: "Analyze compares the latest rewrite against your original — run a rewrite first.",
};

export interface StagePaneProps {
  readonly activeStage: RefineryStage;
  readonly run: RunView | null;
  readonly entries: readonly ReviewEntry[];
  readonly decided: readonly CompareDecision[];
  readonly onDecide: (index: number, decision: CompareDecision) => void;
  readonly viewingBack: boolean;
  /** A call for THIS stage is in flight. Drives the plan-shaped skeleton on a first run and the dimmed
   *  shimmer on a re-run — and, critically, stops the not-run-yet arm from saying "nothing settled" at
   *  the exact moment something is being computed (side-eye 2026-08-09 P1-10: "running status lies"). */
  readonly running: boolean;
}

/** The first-run arm WHILE A CALL IS IN FLIGHT. There is no plan to shape a skeleton from yet (the plan
 *  comes off the run's own payload config), so this is the honest minimum: the stage's own teaching copy
 *  replaced by what is actually happening. The stepper cell carries the indeterminate hairline. */
function RunningPane({ activeStage }: { activeStage: RefineryStage }): ReactElement {
  return (
    <Card>
      <Stack aria-busy={true} gap="row" padding="block">
        <Text voice="label">Running {activeStage}…</Text>
        <Skeleton className="h-control-lg w-full" />
        <Skeleton className="h-control-md w-full" />
        <Skeleton className="h-control-md w-2/3" />
      </Stack>
    </Card>
  );
}

export function StagePane({ activeStage, run, entries, decided, onDecide, viewingBack, running }: StagePaneProps): ReactElement {
  if (run === null) {
    if (running) {
      return <RunningPane activeStage={activeStage} />;
    }
    return (
      <Card>
        <Stack gap="tight" padding="block">
          <Text voice="label">Nothing settled for {activeStage} yet</Text>
          <Text voice="gloss">{NOT_RUN_COPY[activeStage]}</Text>
        </Stack>
      </Card>
    );
  }
  if (activeStage === "rewrite" && run.stage === "rewrite") {
    return <AcceptReview decided={decided} entries={entries} onDecide={onDecide} />;
  }
  const custom = run.payloadConfig.kind === "custom";
  const schema = custom ? (run.payloadConfig as { schema: Record<string, unknown> }).schema : FIXED_SCHEMAS[run.stage];
  const plan = buildRenderPlan(schema, custom ? {} : BUILTIN_STAGE_HINTS[run.stage]);
  return (
    <Stack gap="tight">
      {viewingBack ? (
        <Row align="center" gap="field">
          <RefineryChip tone="warn">viewing round {run.iteration} · superseded</RefineryChip>
        </Row>
      ) : null}
      <PayloadView payload={run.payload as Record<string, unknown>} pending={running} plan={plan} />
    </Stack>
  );
}
