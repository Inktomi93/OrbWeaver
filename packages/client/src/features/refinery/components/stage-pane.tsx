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
}

export function StagePane({ activeStage, run, entries, decided, onDecide, viewingBack }: StagePaneProps): ReactElement {
  if (run === null) {
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
      <PayloadView payload={run.payload as Record<string, unknown>} plan={plan} />
    </Stack>
  );
}
