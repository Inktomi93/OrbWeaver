// THE READINESS RAIL — the corpus surface's answer to a stat strip (program #102 corpus leg, issue #127).
//
// THE DEFECT IT REPLACES: five structural zeros rendered at DISPLAY size directly above an empty state that
// already said "nothing". The fix is not smaller zeros, it is a different KIND of reading — each analysis
// pass becomes a row with a name and a measurement, so a zero stops being a shout and becomes a state
// ("not run", "0 of 10") that a reader can act on. It is also the ONE place on the surface that says what
// has not run, which is what lets every other section simply not render when it has nothing: a section that
// prints its own "No … computed yet." note is a wall built one true sentence at a time.
//
// BOXLESS BY LAW (CD1, UI-Density-Law.md §3.2): a read-only grouping gets a kicker band and hairlines
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
import { RECEDED_INK } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { ModelRunConfirmDialog, useUtilityModel } from "#components";
import { QueryErrorState } from "#data";
import { openConfigTo } from "#state";
import { useUnderstandingPass, useUnderstandingPassTail } from "../hooks/use-understanding-pass.ts";
import type { CorpusReadinessStage } from "../lib/corpus-analysis-state.ts";
import { UnderstandingPassUtilityNote } from "./understanding-pass-utility-note.tsx";

export interface CorpusReadinessRailProps {
  readonly stages: readonly CorpusReadinessStage[];
  /** Render the re-run door. True only once the passes have run — see the header. */
  readonly showRerun: boolean;
  /** THE QUEUE READ every row's ran/not-run half comes from (#1546). When it FAILED, three rows read
   *  "unknown" rather than "not run" and the rail — the surface's one home for what has and has not run —
   *  is where that says so and where the retry lives. */
  readonly queue: { readonly failed: boolean; readonly onRetry: () => void };
}

export function CorpusReadinessRail({ stages, showRerun, queue }: CorpusReadinessRailProps): ReactElement {
  return (
    // THE ROWS KEEP THEIR OWN PITCH, AND THE ISLAND OWNS THE LEFTOVER (side-eye corpus re-pass #2,
    // 2026-08-19 P2-1 — this REVERSES the distribute that landed hours earlier, and both readings are kept).
    //   THE EARLIER SYMPTOM (still true): the rail's height is fixed by construction — five stage rows and a
    //     button — while the track beside it grows with the family count, so at a 1224px pane the column
    //     ended ~250px above the island's foot.
    //   THE FIX THAT WAS TRIED: `flex-1` + `justify="between"`, spreading the hairline rows over the track.
    //   WHY IT LOST, MEASURED: pitch 101/101/101/102px for rows whose ink is ~33px — 67% air, uniform, which
    //     is the generated-UI tell the density spec names — and the failure sentence at the foot got crushed
    //     against the button. A rail whose rows are three line-heights apart is no longer a rail; the void
    //     it replaced was the cheaper defect.
    // So the stage stack is natural again: hairline rows at the tier's own `py-field` pitch, and the column
    // simply ends where its content does. `h-full` stays — the grid still stretches the track, and a Section
    // that fills a stretched track costs nothing while keeping the rail's own background band whole.
    <Section className="h-full" data-slot="readiness-rail" kicker="Readiness" level={2}>
      {/* IT IS A LIST, AND IT SAYS SO (#537, corpus ARIA sweep). The rail rendered as a `<section>` full of
          role-less `<div>`s: a screen reader met five stage rows as one undifferentiated run of text with
          no count and no way to step row by row, on the ONE surface element whose whole job is "here is
          what has and has not run". `role="list"`/`role="listitem"` over the layout primitives is the
          house spelling (the search-result list beside it does the same) — it adds the structure without
          disturbing the hairline-row geometry the P2-1 reversal above settled. */}
      <Stack aria-label="Analysis passes" role="list">
        {stages.map((stage) => (
          // THE PASS'S NAME IS NEVER THE SHRINK VICTIM (#535 N1, a regression of the row's own fix).
          // The datum grew a denominator ("8 families · 242 of 320 characters") while the row was
          // `label: min-w-0 truncate` beside `datum: shrink-0` — so at the 1280px context-closed width the
          // only thing that could give was the LABEL, and "Visual families" rendered as "Visu…". A rail
          // whose whole job is to name what has and has not run cannot ellipsise the name: it is the half
          // of the row that is not re-derivable from anything else on the surface, and the reader who most
          // needs it is the one meeting the pass for the first time.
          // So the row WRAPS instead of truncating: `flex-wrap` lets the datum drop to its own line when
          // the two cannot share one, the label keeps its intrinsic width (no `truncate`), and the datum
          // keeps `shrink-0` so a measurement never breaks mid-number. At every width both facts are whole;
          // what varies is how many lines the row spends, which is the honest thing to trade.
          <Row
            align="center"
            className="flex-wrap border-border border-b py-field last:border-b-0"
            data-slot="readiness-stage"
            gap="row"
            justify="between"
            key={stage.id}
            role="listitem"
          >
            <Row className="min-w-0" gap="field">
              <Icon className={stage.done ? "text-primary" : "text-muted-foreground"} icon={stage.done ? Check : Circle} size="xs" />
              <Text as="span" className="min-w-0" voice="label">
                {stage.label}
              </Text>
            </Row>
            <Text as="span" className={stage.done ? "shrink-0" : "shrink-0 text-muted-foreground"} voice="datum">
              {stage.datum}
            </Text>
          </Row>
        ))}
      </Stack>
      {/* THE READ BEHIND THE RAIL'S OWN VERDICTS, WHEN IT BROKE (#1546). Three of the five rows read
          "unknown" in this state, which is honest but inert on its own — the reader is owed what could not
          be asked and a way to ask again. It sits UNDER the rows and above the re-run for the reason the
          rows are ordered as they are: it qualifies the readings above it. The shared read-error block, not
          a hand-rolled one (`render-error-via-battery`'s whole point). */}
      {queue.failed ? <QueryErrorState label="which passes have run" onRetry={queue.onRetry} /> : null}
      {showRerun ? <CorpusReadinessRerun /> : null}
    </Section>
  );
}

/** The re-run door — and, while a pass is live, that run's state in the rail's own register. */
function CorpusReadinessRerun(): ReactElement {
  const pass = useUnderstandingPass();
  const utility = useUtilityModel();
  const utilityNoteId = useId();
  // The re-run spends exactly what the first run did, so it is held to the same Utility gate and the same confirm.
  const utilityMissing = utility.kind === "unset" || utility.kind === "blocked";
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
      <Button
        aria-describedby={utilityMissing ? utilityNoteId : undefined}
        disabled={pass.starting || utilityMissing}
        intent="primary"
        onClick={pass.start}
        size="sm"
      >
        Run the passes again
      </Button>
      {utilityMissing ? <UnderstandingPassUtilityNote id={utilityNoteId} utility={utility} /> : null}
      <ModelRunConfirmDialog {...pass.confirm} />
      {/* A DIED run and a FAILED run are different sentences (issue #166 rider 3): `worker_died` carries no
          reason of its own, so quoting `pass.failure` printed "stopped: undefined" — a failure state that
          reads as a broken message rather than a run to retry.

          THE FAILURE AND THE DOOR ARE NOT ALTERNATIVES (side-eye corpus re-pass A5). This was a ternary: the
          jobs door rendered only while `pass.failure === null`, so the ONE branch whose copy sends you to
          the error log was the one branch that deleted the route to it — the recovery affordance vanished
          at precisely the moment it became the point. The message is conditional; the door never is. */}
      {/* AN ERROR IS NOT METADATA (side-eye corpus re-pass #2, P2-7). This rendered at `gloss` — 10.5px, the
          footnote step — which made the failure the SMALLEST text on the surface, quieter than the datum of
          every pass that succeeded. It is a sentence the reader has to act on, so it takes the body step and
          kept `text-destructive` for the state — the COLOUR half of that ruling was reversed by re-pass #3
          and the STEP half still holds; the block below states the fork. The message itself is the server's, verbatim: the row's
          `error` column is durable, so an old row still shows the copy that was live when it FAILED (the C4
          template fix reaches the next run, never the stored text of the last one). */}
      {/* IT NEEDS TO SAY WHEN (side-eye corpus re-pass #3, P3-F). Five green checks above a red sentence
          read as CONTRADICTING each other — the rows report the library's current state, the sentence
          reports one RUN, and nothing on the surface said so. The kicker is the rail's own band vocabulary,
          which is what makes the two readings sit together instead of arguing.

          AND ONE STEP QUIETER, WHICH IS A FORK WITH THE P2-7 RULING RECORDED ABOVE (stated for the record).
          P2-7 moved this line off `gloss` because "an error is not metadata" — at 10.5px it was the
          SMALLEST text on a surface whose failing state it was reporting. Re-pass #3 then measured the
          opposite end: it out-weighed the five status rows, and CTA-amber plus danger-red read as one warm
          mass, with the receipt "the CTA is the only warm element in the column". Both are satisfied by
          moving the axis that P2-7 was not about: the STEP stays a reading step (`label`, 13px — above the
          footnote register P2-7 rejected, above the interactive floor, and the same step as the stage rows
          it now sits with), and the COLOUR gives way, because the words already state the case and this
          file's own header says the state is never carried by hue alone. The one primary door keeps the
          column's only warm ink. */}
      {pass.failure === null ? null : (
        <Stack data-slot="readiness-rerun-failure" gap="tight">
          <Text voice="kicker">Last run</Text>
          <Text className="text-muted-foreground" voice="label">
            {pass.failureWasCrash ? "The last pass stopped unexpectedly — run it again." : `The last pass stopped: ${pass.failure}`}
          </Text>
        </Stack>
      )}
      {/* THE JOBS DOOR RECEDES BEHIND THE ONE PRIMARY (#1256, 2026-09-02 — the #1141/#1244/#1249 fork,
          seventh instance). It renders beside `Run the passes again` — the column's one warm/filled
          control per this file's own "ONE primary" ruling above — and #969 flipped `ghost` to
          `text-current`, so it now paints at the same weight as that primary. The primitive keeps
          inheriting; this composite states its own ink. */}
      <Button className={RECEDED_INK} data-slot="readiness-jobs-door" intent="ghost" onClick={(): void => openConfigTo("workloads", "jobs")} size="sm">
        All jobs in Settings → Jobs
      </Button>
    </Stack>
  );
}
