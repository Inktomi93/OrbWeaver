// The Score → Rewrite → Analyze stepper (the mocks' Frame-1 anatomy): three stage cells with a
// per-stage status line, the ACTIVE stage's cell highlighted, the RUNNING stage carrying its spinner +
// in-cell Abort-free running note (runs are one bounded call — the surface never goes blank between
// stages, the previous settled payload stays under it). A pending stage states WHY it cannot run yet
// (the stage-order rule the server enforces) instead of a bare disabled cell.

import type { RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGES } from "@orb/contracts/refinery";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Spinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";

export interface StageCell {
  readonly stage: RefineryStage;
  /** The one-line status ("overall 6.8 · full" / "not run yet" / "needs a score first"). */
  readonly status: string;
  readonly done: boolean;
  readonly running: boolean;
}

export interface StageStepperProps {
  readonly cells: readonly StageCell[];
  readonly active: RefineryStage;
  readonly onSelect: (stage: RefineryStage) => void;
}

const STAGE_LABEL: Record<RefineryStage, string> = { score: "Score", rewrite: "Rewrite", analyze: "Analyze" };

export function StageStepper({ cells, active, onSelect }: StageStepperProps): ReactElement {
  return (
    <Row data-testid={testId("refineryStepper")} gap="tight">
      {REFINERY_STAGES.map((stage, i) => {
        const cell = cells.find((c) => c.stage === stage);
        const isActive = active === stage;
        return (
          <Button
            aria-current={isActive ? "step" : undefined}
            className="flex-1 justify-start"
            data-stage={stage}
            data-testid={testId("refineryStep")}
            intent={isActive ? "primary" : "secondary"}
            key={stage}
            onClick={(): void => onSelect(stage)}
            size="lg"
          >
            <Row align="center" gap="row">
              {cell?.running === true ? (
                <Spinner label="Running" size="sm" />
              ) : (
                <Text as="span" voice="datum">
                  {i + 1}
                </Text>
              )}
              <Stack align="start" gap="tight">
                <Text as="span" voice="label">
                  {STAGE_LABEL[stage]}
                </Text>
                <Text as="span" voice="gloss">
                  {cell?.status ?? "not run yet"}
                </Text>
              </Stack>
            </Row>
          </Button>
        );
      })}
    </Row>
  );
}
