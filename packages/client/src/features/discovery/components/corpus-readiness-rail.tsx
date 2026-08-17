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
// gone and the rail carries the quiet re-run, which is the only affordance left that needs a home.

import { Button } from "@orb/ui/button";
import { Check, Circle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { openSettingsTo } from "#state";
import type { CorpusReadinessStage } from "../lib/corpus-analysis-state.ts";

export interface CorpusReadinessRailProps {
  readonly stages: readonly CorpusReadinessStage[];
  /** Render the quiet re-run door. True only once the passes have run — see the header. */
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
      {showRerun ? (
        <Stack gap="tight">
          <Button intent="ghost" onClick={(): void => openSettingsTo("workloads", "jobs")} size="sm">
            Run the passes again…
          </Button>
          <Text voice="gloss">Opens Settings → Jobs.</Text>
        </Stack>
      ) : null}
    </Section>
  );
}
