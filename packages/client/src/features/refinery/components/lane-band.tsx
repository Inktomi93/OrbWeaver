// The WORKBENCH lane's shared chrome (mockup variant C): the numbered band that names a lane
// and the note row that says what is wrong with what it is showing. Both are shared by all three lanes, so
// they are one anatomy in one file rather than three drawings that drift.
//
// THE BAND IS A `Section` KICKER AT `h3`, NOT `h2`, so the session title never sits at its lanes' level. The workbench's one opening statement is the masthead's `h2` (`session-masthead.tsx`), and the
// lanes are blocks OF that session — three peers one step under it, which is exactly what `Section`'s own
// `level` default states for the same shape. At `h2` the outline would say the session and each of
// its lanes are siblings, so a heading walk would read four peer blocks with no subject.
//
// THE NOTE ROW IS THE VIEW-BACK PIN'S ONLY WAY HOME. The pipeline is parallel — there is no stepper to
// switch — so walking back would strand a user on a superseded run forever without an explicit verb, so "Back to
// latest" ships beside the chip that announces the walk.

import { modelDisplayName } from "@orb/kit/model-name";
import { Button } from "@orb/ui/button";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
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
  return <Section data-testid={testId("refineryLaneBand")} kicker={kicker} level={3} trailing={children ?? null} />;
}

/** The model that produced THIS lane's result — each stage can run on a different model, so the credit
 *  rides the result, not the session. A readable name; the full identifier (a local weights path can run
 *  past 100 characters) is a press-opened hint only when the derivation shortened it. Nothing for a hand-authored run. */
export function RunModelCredit({ model }: { readonly model: string | null }): ReactElement | null {
  if (model === null) {
    return null;
  }
  const shown = modelDisplayName(model);
  return (
    <>
      <Text as="span" voice="credit">
        {shown}
      </Text>
      {shown === model ? null : <HintTrigger className="" hint={model} subject="the model" />}
    </>
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
    <Row align="center" wrap={true} gap="field">
      {viewingBack ? (
        <>
          <RefineryChip tone="warn">Viewing round {iteration ?? 0} · superseded</RefineryChip>
          <Button variant="ghost" onClick={onBackToLatest} size="sm">
            Back to latest
          </Button>
        </>
      ) : null}
      {behind === null ? null : <RefineryChip tone="warn">{behind}</RefineryChip>}
    </Row>
  );
}
