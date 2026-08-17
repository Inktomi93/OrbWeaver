// The WORKBENCH lane's shared chrome (program #102, mockup variant C): the numbered band that names a lane
// and the note row that says what is wrong with what it is showing. Both are shared by all three lanes, so
// they are one anatomy in one file rather than three drawings that drift.
//
// WHY NOT `<Section kicker>`. That primitive IS the sanctioned band (caps micro heading + a hairline rule
// running to the edge) and the lanes keep its exact anatomy — but its rule is `flex-1` to the edge with no
// trailing slot, and the mockup's rewrite band carries the accept tally after the rule. Rather than fight a
// sealed primitive from a feature, the band is composed here from the SAME two parts the primitive uses
// (`Heading voice="kicker"` + `Separator`), which is what keeps the drawing identical: one voice, one rule,
// one step. The heading is a real `h2` — the three lanes are peer blocks of the workbench, not children of
// whichever lane precedes them (the outline lesson from home's side-eye F6).
//
// THE NOTE ROW IS THE VIEW-BACK PIN'S ONLY WAY HOME. Clearing the pin used to be a side effect of pressing
// a stage in the stepper; with the stepper gone (the pipeline is parallel — there is nothing to switch),
// walking back would strand a user on a superseded run forever without an explicit verb, so "Back to
// latest" ships beside the chip that announces the walk.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Heading } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { testId } from "#lib";
import { RefineryChip } from "./refinery-chip.tsx";

export interface LaneBandProps {
  /** The lane's name in the `kicker` voice ("1 · Score", "2 · Rewrite · balanced"). */
  readonly kicker: string;
  /** What rides AFTER the rule — the accept tally on the rewrite band, nothing on the rails. */
  readonly children?: ReactNode;
}

export function LaneBand({ kicker, children }: LaneBandProps): ReactElement {
  return (
    <Row align="center" className="flex-wrap" data-testid={testId("refineryLaneBand")} gap="field">
      <Heading level={2} voice="kicker">
        {kicker}
      </Heading>
      <Separator className="flex-1" />
      {children}
    </Row>
  );
}

export interface LaneNotesProps {
  /** The lane is showing a run the CONTEXT ledger pinned (§16.1's walker). */
  readonly viewingBack: boolean;
  /** The shown run's round, for the superseded chip's wording. */
  readonly iteration: number | null;
  /** Why the lane's payload no longer answers the pipeline beside it, or null when it is current. */
  readonly behind: string | null;
  readonly onBackToLatest: () => void;
}

/** The lane's two honesty notes. Nothing renders when the lane is current and live — the row is a STATE,
 *  never a permanent slot that reserves height for a condition that is usually absent. */
export function LaneNotes({ viewingBack, iteration, behind, onBackToLatest }: LaneNotesProps): ReactElement | null {
  if (!viewingBack && behind === null) {
    return null;
  }
  return (
    <Row align="center" className="flex-wrap" gap="field">
      {viewingBack ? (
        <>
          <RefineryChip tone="warn">viewing round {iteration ?? 0} · superseded</RefineryChip>
          <Button intent="ghost" onClick={onBackToLatest} size="sm">
            Back to latest
          </Button>
        </>
      ) : null}
      {behind === null ? null : <RefineryChip tone="warn">{behind}</RefineryChip>}
    </Row>
  );
}
