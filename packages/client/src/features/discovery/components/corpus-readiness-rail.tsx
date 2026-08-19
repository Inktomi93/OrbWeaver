// THE READINESS RAIL — the corpus surface's answer to a stat strip (program #102 corpus leg, issue #127).
//
// THE DEFECT IT REPLACES: five structural zeros rendered at DISPLAY size directly above an empty state that
// already said "nothing". The fix is not smaller zeros, it is a different KIND of reading — each analysis
// pass becomes a row with a name and a measurement, so a zero stops being a shout and becomes a state
// ("not run", "0 of 10") that a reader can act on. It is also the ONE place on the surface that says what
// has not run, which is what lets every other section simply not render when it has nothing: a section that
// prints its own "No … computed yet." note is a wall built one true sentence at a time.
//
// BOXLESS BY LAW (CD1, density-pass-spec.md §3.2): a read-only grouping gets a kicker band and hairlines
// between its rows, never a border+radius+background. The surface's one box is whichever island currently
// holds the focal, and this rail is deliberately not it.
//
// THE STATE GLYPH IS A SHAPE, NOT A COLOUR. `Check` vs `Circle` differ before any hue is resolved, and the
// row's own datum states the case in words regardless — the glyph is decorative (`Icon` with no `label` is
// aria-hidden), so nothing here carries meaning by colour alone.
//
// IT HOLDS NO PRIMARY DOOR WHILE THE LIBRARY IS UN-ANALYSED. One door per screen (the ruling
// `corpus-run-job-empty-state.tsx` records, from two identical "Run a job…" buttons 400px apart): in that
// state the INVITATION island is the focal and owns the verb. Once the passes have run the invitation is
// gone and the rail carries the re-run, which is the only affordance left that needs a home — and it
// therefore inherits the invitation's `intent="primary"`, because the two never render together and a
// surface's one door does not get quieter for having outlived its neighbour (#244 P1-3; the earlier
// "quiet re-run" spelling made it literally invisible, see the button's own comment).
//
// AND THAT RE-RUN RUNS THE PASS (issue #155's other half). It deep-linked to Settings → Jobs, exactly like
// the invitation did — so fixing only the invitation would have left the identical defect one phase later,
// on the same surface, for the user who has already been through it once. It shares the invitation's hook,
// so the dedupe is the same read and a run started from either place is visible from both; while a run holds
// the floor the button gives way to the stage sentence at the rail's own datum weight (a progress BAR here
// would be a second box on a deliberately boxless grouping, CD1).

import { Button } from "@orb/ui/button";
import { Check, Circle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { openSettingsTo } from "#state";
import { useUnderstandingPass, useUnderstandingPassTail } from "../hooks/use-understanding-pass.ts";
import type { CorpusReadinessStage } from "../lib/corpus-analysis-state.ts";

export interface CorpusReadinessRailProps {
  readonly stages: readonly CorpusReadinessStage[];
  /** Render the re-run door. True only once the passes have run — see the header. */
  readonly showRerun: boolean;
}

export function CorpusReadinessRail({ stages, showRerun }: CorpusReadinessRailProps): ReactElement {
  return (
    <Section kicker="Readiness" level={2}>
      <Stack>
        {stages.map((stage) => (
          <Row align="center" className="border-border border-b py-field last:border-b-0" gap="row" justify="between" key={stage.id}>
            <Row className="min-w-0" gap="field">
              <Icon className={stage.done ? "text-primary" : "text-muted-foreground"} icon={stage.done ? Check : Circle} size="xs" />
              <Text as="span" className="min-w-0 truncate" voice="label">
                {stage.label}
              </Text>
            </Row>
            <Text as="span" className={stage.done ? "shrink-0" : "shrink-0 text-muted-foreground"} voice="datum">
              {stage.datum}
            </Text>
          </Row>
        ))}
      </Stack>
      {showRerun ? <CorpusReadinessRerun /> : null}
    </Section>
  );
}

/** The re-run door — and, while a pass is live, that run's state in the rail's own register. */
function CorpusReadinessRerun(): ReactElement {
  const pass = useUnderstandingPass();
  useUnderstandingPassTail(pass.liveRunId, pass.onLiveProgress);
  if (pass.running) {
    return (
      <Stack data-slot="readiness-rerun-running" gap="tight">
        <Text as="span" voice="datum">
          {pass.stage}
        </Text>
        {pass.detail === null ? null : <Text voice="gloss">{pass.detail}</Text>}
      </Stack>
    );
  }
  return (
    <Stack align="start" gap="tight">
      {/* PAINTED AND BOUNDED (#244 P1-3). This shipped `intent="ghost"` inside a stretch-aligned Stack, so
          the surface's ONLY door computed 869x32, transparent, borderless, at muted-foreground 13px, its
          label centred — a caption with a click handler, which is what the pass measured and what a
          first-timer reads it as. "Quiet" was the intent of the SLOT, never of the affordance; the mockup
          draws this exact control as a solid accent button (`corpus-a-cartographer.html`: `btn-primary` in
          the readiness aside). `align="start"` is the other half — a button that spans its whole column is
          a banner whichever intent it carries.

          ONE primary, and it is never TWO: this rerun renders only while `showRerun` is true, which is
          exactly the phase in which the invitation (and its own `intent="primary"` door) is gone. CD3's
          focal budget is spent by the map island's ring, not by a control. */}
      <Button disabled={pass.starting} intent="primary" onClick={pass.start} size="sm">
        Run the passes again
      </Button>
      {/* A DIED run and a FAILED run are different sentences (issue #166 rider 3): `worker_died` carries no
          reason of its own, so quoting `pass.failure` printed "stopped: undefined" — a failure state that
          reads as a broken message rather than a run to retry.

          THE FAILURE AND THE DOOR ARE NOT ALTERNATIVES (side-eye corpus re-pass A5). This was a ternary: the
          jobs door rendered only while `pass.failure === null`, so the ONE branch whose copy sends you to
          the error log was the one branch that deleted the route to it — the recovery affordance vanished
          at precisely the moment it became the point. The message is conditional; the door never is. */}
      {pass.failure === null ? null : (
        <Text className="text-destructive" data-slot="readiness-rerun-failure" voice="gloss">
          {pass.failureWasCrash ? "The last pass stopped unexpectedly — run it again." : `The last pass stopped: ${pass.failure}`}
        </Text>
      )}
      <Button data-slot="readiness-jobs-door" intent="ghost" onClick={(): void => openSettingsTo("workloads", "jobs")} size="sm">
        All jobs in Settings → Jobs
      </Button>
    </Stack>
  );
}
