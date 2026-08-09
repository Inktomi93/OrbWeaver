// The run bar (extracted from the content surface under the component-size cap): guidance
// (blur-commit), the §8 fit line, the run/iterate/hand-edit verbs, and the preflight WARN arm —
// advisory copy + the narrow-the-selection action (§8: preflight WARNS, never blocks). Owns the
// guidance draft + its update mutation; the parent owns which stage is effective.

import type { RefineryStage } from "@orb/contracts/refinery";
import type { RefinerySessionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { useUpdateRefinerySession } from "../hooks/use-refinery-mutations.ts";
import type { useRefineryPreflight } from "../hooks/use-refinery-schemas.ts";

// Re-derived locally from the preflight hook's wire shape (§7.4 — never an exported alias).
type StagePreflightView = NonNullable<ReturnType<typeof useRefineryPreflight>["data"]>["stages"][number];

export interface RunControlsCardProps {
  readonly sessionId: RefinerySessionId;
  readonly guidance: string | null;
  readonly running: boolean;
  readonly stagePre: StagePreflightView | undefined;
  readonly contextTokens: number | null;
  readonly effectiveStage: RefineryStage;
  readonly hasRun: boolean;
  readonly canIterate: boolean;
  readonly onManualOpen: () => void;
  readonly onScopeOpen: () => void;
  readonly onRun: () => void;
  readonly onIterate: () => void;
}

/** The two §8 over-budget verdicts, derived once. */
function overBudgetOf(stagePre: StagePreflightView | undefined, contextTokens: number | null): { outputOver: boolean; inputOver: boolean } {
  const outputOver = stagePre !== undefined && stagePre.maxOutputTokens !== null && stagePre.outputEstimate > stagePre.maxOutputTokens;
  const inputOver = stagePre !== undefined && contextTokens !== null && stagePre.inputEstimate > contextTokens;
  return { outputOver, inputOver };
}

/** The fit readout: both directions, ceilings included where resolved, the ⚠ on either overrun. */
function FitLine({ stagePre, contextTokens, warn }: { stagePre: StagePreflightView; contextTokens: number | null; warn: boolean }): ReactElement {
  return (
    <Text data-testid={testId("refineryFitLine")} voice="datum">
      in ≈ {stagePre.inputEstimate}
      {contextTokens === null ? "" : ` / ${contextTokens}`} · out ≈ {stagePre.outputEstimate}
      {stagePre.maxOutputTokens === null ? "" : ` / ${stagePre.maxOutputTokens}`} tok{warn ? " ⚠" : ""}
    </Text>
  );
}

/** The §8 WARN arm — advisory copy + the narrow-the-selection action (warns, never blocks). */
function PreflightWarn({
  stagePre,
  outputOver,
  effectiveStage,
  onScopeOpen,
}: {
  stagePre: StagePreflightView;
  outputOver: boolean;
  effectiveStage: RefineryStage;
  onScopeOpen: () => void;
}): ReactElement {
  return (
    <Row align="center" gap="field" padding="row">
      <Text data-testid={testId("refineryPreflightWarn")} voice="gloss">
        {outputOver
          ? `The expected ${effectiveStage} output likely exceeds the resolved max output (${stagePre.maxOutputTokens} tok) — a thinking model spends this budget on reasoning too. Raise max output in the preset, or narrow the selection.`
          : "The assembled prompt likely exceeds the model's context — narrow the selection."}
      </Text>
      <Button intent="ghost" onClick={onScopeOpen} size="sm">
        Narrow the selection
      </Button>
    </Row>
  );
}

export function RunControlsCard({
  sessionId,
  guidance,
  running,
  stagePre,
  contextTokens,
  effectiveStage,
  hasRun,
  canIterate,
  onManualOpen,
  onScopeOpen,
  onRun,
  onIterate,
}: RunControlsCardProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateSession = useUpdateRefinerySession({ trpc, invalidation });
  const [guidanceDraft, setGuidanceDraft] = useState<string | null>(null);
  const { outputOver, inputOver } = overBudgetOf(stagePre, contextTokens);
  return (
    <Card>
      {/* TWO ROWS, NOT ONE (side-eye 2026-08-09 P1-2). One Row held the guidance Field, the fit line and
          three verbs; the fit line and the verbs are min-content and `shrink-0`, so at the real 3-pane
          desktop width the Field — the only flexible child — was squeezed to **26px**, i.e. the surface's
          primary text input was unusable at the width it actually ships at. Splitting the row is the fix
          the geometry demands: an input and its action cluster cannot share one line's slack. */}
      <Stack gap="row" padding="row">
        <Field label="Guidance">
          <Textarea
            onBlur={(): void => {
              if (guidanceDraft !== null && guidanceDraft !== (guidance ?? "")) {
                updateSession.mutate({ sessionId, patch: { guidance: guidanceDraft.length === 0 ? null : guidanceDraft } });
              }
            }}
            onChange={(e): void => setGuidanceDraft(e.target.value)}
            placeholder="Guidance for every stage — e.g. keep her mean"
            rows={2}
            value={guidanceDraft ?? guidance ?? ""}
          />
        </Field>
        {/* FLEX-WRAP, AND THE VERB CLUSTER KEEPS ITS CONTENT FLOOR (side-eye 2026-08-09 P1). The cluster
            was `min-w-0 flex-1`, so at the 3-pane / mobile CONTAINER width it shrank BELOW its own buttons
            and they overflowed their box, painting the fit-line readout THROUGH the Hand-edit button
            (measured 31px overlap at 3-pane, worse on mobile). Dropping `min-w-0` restores the cluster's
            content floor so it can no longer collapse under its buttons, and `flex-wrap` on the parent
            drops the cluster onto its OWN line the instant the fit-line + verbs stop fitting — the fit-line
            no longer shares one line's slack with an action cluster it cannot out-shrink. `flex-1
            justify-end` keeps the verbs right-aligned whether they sit beside the fit-line or wrap below. */}
        <Row align="center" className="flex-wrap" gap="row">
          {stagePre !== undefined ? <FitLine contextTokens={contextTokens} stagePre={stagePre} warn={outputOver || inputOver} /> : null}
          <Row className="flex-1 justify-end" gap="row">
            <Button disabled={running} intent="ghost" onClick={onManualOpen} size="sm">
              Hand-edit
            </Button>
            {/* THE PANE'S ONE PRIMARY (P1-11). The run verb is the CTA; everything else in this card is
                secondary or ghost, and the stage stepper no longer competes for the fill. `Iterate`
                replaces it as the primary on analyze rather than sitting beside it — two filled buttons
                in one cluster is the same inverted-hierarchy defect one row down. */}
            {effectiveStage === "analyze" ? (
              <>
                <Button disabled={running} intent="secondary" onClick={onRun} size="sm">
                  {hasRun ? "Re-run analyze" : "Run analyze"}
                </Button>
                <Button aria-busy={running} disabled={running || !canIterate} onClick={onIterate} size="sm">
                  Iterate
                </Button>
              </>
            ) : (
              <Button aria-busy={running} disabled={running} onClick={onRun} size="sm">
                {hasRun ? `Re-run ${effectiveStage}` : `Run ${effectiveStage}`}
              </Button>
            )}
          </Row>
        </Row>
      </Stack>
      {(outputOver || inputOver) && stagePre !== undefined ? (
        <PreflightWarn effectiveStage={effectiveStage} onScopeOpen={onScopeOpen} outputOver={outputOver} stagePre={stagePre} />
      ) : null}
    </Card>
  );
}
