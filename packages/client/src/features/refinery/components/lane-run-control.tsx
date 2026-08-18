// One WORKBENCH lane's own run control (program #102, mockup variant C): the §8 fit readout, the stage's
// Run/Re-run verb, the indeterminate running hairline, and the §8 WARN arm — advisory copy plus the
// narrow-the-selection action (preflight WARNS, never blocks).
//
// WHY IT IS PER LANE NOW. All three of these are PER-STAGE facts — the preflight slice is keyed by stage,
// and so is the verb. They used to sit in the one run bar, which only worked because the deleted stage
// stepper supplied an `effectiveStage`: the bar showed whichever stage the stepper happened to be pointing
// at. On a canvas where all three stages are visible at once there is no such pointer, and a single
// context-dependent "Re-run" would be a verb whose target the user has to infer. So the fit line and the
// verb travel with the lane whose numbers they are, and the foot bar keeps only the SESSION-wide acts
// (guidance · Hand-edit · Iterate · the terminal apply).
//
// THE HAIRLINE MOVED HERE FROM THE STEPPER, WITH ITS CONTRACT INTACT: a bottom-edge sweep that says "this
// stage is working" without the lane going blank under it. Compositor-only (`translate`), and it carries
// its own reduced-motion opt-out through the shared `orb-indeterminate-hairline` class
// (ui/src/styles/globals.css), which REMOVES the travelling segment outright per motion guide §3.9 rather
// than parking it — a frozen bar at one end reads as a stalled determinate progress bar, which is a worse
// lie than no affordance. `aria-hidden` because it is pure ornament: the verb beside it is already
// `aria-busy` while the call is in flight, so the state is announced once. The class also owns its own
// containing block and clip (#143) — this host contributes only the track's ink and height, never
// `relative`/`overflow-hidden`, so there is exactly one place the segment's geometry is decided.

import type { RefineryStage } from "@orb/contracts/refinery";
import { Button } from "@orb/ui/button";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";
import type { useRefineryPreflight } from "../hooks/use-refinery-schemas.ts";

// Re-derived locally from the preflight hook's wire shape (§7.4 — never an exported alias).
type StagePreflightView = NonNullable<ReturnType<typeof useRefineryPreflight>["data"]>["stages"][number];

export interface LaneRunControlProps {
  readonly stage: RefineryStage;
  readonly stagePre: StagePreflightView | undefined;
  readonly contextTokens: number | null;
  /** This stage has a settled run — the verb says Re-run rather than Run. */
  readonly hasRun: boolean;
  /** A call for THIS stage is in flight. */
  readonly running: boolean;
  /** Any call is in flight — a second concurrent run is not offered while one is working. */
  readonly busy: boolean;
  /** Why the SERVER would refuse this stage right now, in the user's words — null when it is runnable.
   *  Non-null disables the verb AND prints this line beside it (#158 item 4). A gate with no reason is
   *  half the defect: "Run analyze" painted at full enabled weight while its own caption stated the
   *  precondition it ignored, and a control that is merely greyed tells the user nothing about how to
   *  un-grey it. Derived in `lib/workbench-lanes.ts` off the domain's `assertStageReady`, never here. */
  readonly blocked: string | null;
  readonly onRun: () => void;
  readonly onScopeOpen: () => void;
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
    // NEVER `truncate`, and never shrinkable: a rail is 15rem and the readout is ~34 characters, so
    // shrinking it ellipsed the OUT half away ("in ≈ 2736 / 8000 · out ≈ 1490…") — half a budget line is
    // worse than none, because the number a user checks before pressing Run is the one that got cut.
    //
    // THE MECHANISM IS `whitespace-nowrap`, NOT `basis-full` (side-eye 2026-08-17, finding e). Forcing the
    // readout onto its own row put ~100px of chrome above every lane's content ×3 lanes, and it did so
    // unconditionally — the fluid rewrite lane has room for both on one line. `nowrap` makes the readout's
    // MIN-CONTENT its whole string, so the flex row keeps it whole either way: inline with the verb where
    // it fits, wrapped onto its own line where it does not. Same guarantee, paid for only where it is owed.
    // `voice="gloss"`, not `datum`: a budget advisory is the quiet line under the lane's NAME, and at
    // `datum` (13px mono foreground) it outranked the 10.5px kicker naming the lane it belongs to.
    <Text className="whitespace-nowrap" data-testid={testId("refineryFitLine")} voice="gloss">
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
  stage,
  onScopeOpen,
}: {
  stagePre: StagePreflightView;
  outputOver: boolean;
  stage: RefineryStage;
  onScopeOpen: () => void;
}): ReactElement {
  return (
    <Stack data-testid={testId("refineryPreflightWarn")} gap="tight">
      <Text voice="gloss">
        {outputOver
          ? `The expected ${stage} output likely exceeds the resolved max output (${stagePre.maxOutputTokens} tok) — a thinking model spends this budget on reasoning too. Raise max output in the preset, or narrow the selection.`
          : "The assembled prompt likely exceeds the model's context — narrow the selection."}
      </Text>
      <Row justify="start">
        <Button intent="ghost" onClick={onScopeOpen} size="sm">
          Narrow the selection
        </Button>
      </Row>
    </Stack>
  );
}

/** The lane's running ornament — see the header for the reduced-motion contract it carries. */
function RunningHairline(): ReactElement {
  return (
    <Container
      aria-hidden={true}
      className="orb-indeterminate-hairline pointer-events-none h-px rounded-full bg-primary/30"
      data-testid={testId("refineryLaneHairline")}
      name="refinery-lane-hairline"
    />
  );
}

export function LaneRunControl({ stage, stagePre, contextTokens, hasRun, running, busy, blocked, onRun, onScopeOpen }: LaneRunControlProps): ReactElement {
  const { outputOver, inputOver } = overBudgetOf(stagePre, contextTokens);
  return (
    <Stack data-lane-run={stage} gap="tight">
      {/* WRAPS, and the verb keeps its content floor. The rails are 15rem/17rem wide: a fit readout and a
          verb cannot share one line's slack there, and the verb is the thing that must never shrink under
          its own label (the run-bar overlap this exact pair produced at 3-pane width, side-eye P1). */}
      <Row align="center" className="flex-wrap" gap="field">
        {stagePre === undefined ? null : <FitLine contextTokens={contextTokens} stagePre={stagePre} warn={outputOver || inputOver} />}
        <Row className="flex-1 justify-end" gap="field">
          <Button aria-busy={running} disabled={busy || blocked !== null} intent="secondary" onClick={onRun} size="sm">
            {hasRun ? `Re-run ${stage}` : `Run ${stage}`}
          </Button>
        </Row>
      </Row>
      {/* THE REASON RIDES WITH THE DISABLE (the prop's own note). A `title` would not do: it is
          pointer-only, and this sentence is the whole of how a user learns what to press instead. */}
      {blocked === null ? null : <Text voice="gloss">{blocked}</Text>}
      {running ? <RunningHairline /> : null}
      {(outputOver || inputOver) && stagePre !== undefined ? (
        <PreflightWarn onScopeOpen={onScopeOpen} outputOver={outputOver} stage={stage} stagePre={stagePre} />
      ) : null}
    </Stack>
  );
}
