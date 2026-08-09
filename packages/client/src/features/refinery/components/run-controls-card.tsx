// The run bar (extracted from the content surface under the component-size cap): guidance
// (blur-commit), the §8 fit line, the run/iterate/hand-edit verbs, and the preflight WARN arm —
// advisory copy + the narrow-the-selection action (§8: preflight WARNS, never blocks). Owns the
// guidance draft + its update mutation; the parent owns which stage is effective.

import type { RefineryStage } from "@orb/contracts/refinery";
import type { RefinerySessionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Field } from "@orb/ui/field";
import { Row } from "@orb/ui/layout";
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
      <Row align="center" gap="row" padding="row">
        <Field className="min-w-0 flex-1" label="Guidance">
          <Textarea
            onBlur={(): void => {
              if (guidanceDraft !== null && guidanceDraft !== (guidance ?? "")) {
                updateSession.mutate({ sessionId, patch: { guidance: guidanceDraft.length === 0 ? null : guidanceDraft } });
              }
            }}
            onChange={(e): void => setGuidanceDraft(e.target.value)}
            placeholder="Guidance for every stage — e.g. keep her mean"
            rows={1}
            value={guidanceDraft ?? guidance ?? ""}
          />
        </Field>
        {stagePre !== undefined ? <FitLine contextTokens={contextTokens} stagePre={stagePre} warn={outputOver || inputOver} /> : null}
        <Button disabled={running} intent="secondary" onClick={onManualOpen} size="sm">
          Hand-edit
        </Button>
        <Button disabled={running} intent="secondary" onClick={onRun} size="sm">
          {hasRun ? `Re-run ${effectiveStage}` : `Run ${effectiveStage}`}
        </Button>
        {effectiveStage === "analyze" ? (
          <Button disabled={running || !canIterate} onClick={onIterate} size="sm">
            Iterate
          </Button>
        ) : null}
      </Row>
      {(outputOver || inputOver) && stagePre !== undefined ? (
        <PreflightWarn effectiveStage={effectiveStage} onScopeOpen={onScopeOpen} outputOver={outputOver} stagePre={stagePre} />
      ) : null}
    </Card>
  );
}
