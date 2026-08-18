// THE INVITATION — the corpus surface's focal while the library is un-analysed (program #102 corpus leg,
// issue #127; mockup B "The Field Journal"'s island, borrowed into mockup A by the owner's ruled state-swap).
//
// WHY IT HOLDS THE FOCAL AND THE MAP DOES NOT, on this state. The audited defect was a stat strip of five
// display zeros standing above an empty state that already said "nothing" — a confident wall of numbers
// saying, loudly, nothing. The compositional answer is not to shrink the zeros: it is that the un-analysed
// state's most important fact is not a measurement at all, it is a DOOR. So the one elevated, glowing thing
// on the page becomes the sentence that says what has and has not been read, with the way to change it.
// The family map keeps rendering underneath, boxless — it is real, it is just not what you came for yet.
//
// THE DOOR RUNS THE JOBS (issue #155, owner-ruled: "just fucking run the job if they click the button").
// It used to deep-link to Settings → Jobs and tell the user to run two named jobs themselves — a door that
// described the work instead of doing it, on the one surface whose whole state depends on that work. The
// click now enqueues `distill-characters`, then `compute-themes` CHAINED on it through the engine's own
// `dependsOn` DAG gate (`hooks/use-understanding-pass.ts` states the mechanism and the dedupe), and the card
// becomes that run's progress state. This is NOT a re-implementation of the Jobs pane: it does not pick a
// kind, tune params, schedule, or cancel — the generic runs console keeps all of that, and the quiet link
// below still goes there for anyone who wants the full view. Features never import each other; the enqueue
// rides `trpc.workloads.start`, the one sanctioned cross-feature channel (D43(3)).
//
// THE PROSE STILL NAMES THE JOBS BY THEIR PICKER LABELS ("Distill characters", "Compute themes" —
// `WORKLOAD_KIND_LABELS`) so the sentence and the rows that appear in Settings → Jobs agree word for word.
// The button's trailing ellipsis is GONE with the picker it promised: this is a one-click run now, and an
// ellipsis on it would be the lie in the other direction.
//
// NO NUMBERS LIVE HERE. The mockup's island carries an inline `8 visual families · 0 distilled · …` readout;
// the readiness rail in the next grid track carries exactly those four readings, at datum weight, with the
// completeness each one actually has. Printing them twice on one screen is the IA duplication the density
// pass lists as its fourth habit, and the rail is the better home because a stage there can say "3 of 10".
//
// "THEMES" IS ALWAYS "STORY THEMES" on this surface — the discovery domain's distillation output, not the
// app's colour themes. The two share a word and the owner has been caught by it once.

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Icon, Sparkles } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Heading, Text } from "@orb/ui/text";
import type { CSSProperties, ReactElement } from "react";
import { useId } from "react";
import { openSettingsTo } from "#state";
import type { UnderstandingPassView } from "../hooks/use-understanding-pass.ts";
import { useUnderstandingPass, useUnderstandingPassTail } from "../hooks/use-understanding-pass.ts";

/** The speaker stripe — the immersive-row / hearth-hero declarations, inline because a border WIDTH from a
 *  non-spacing token has no utility to ride. */
const STRIPE: CSSProperties = {
  borderInlineStartWidth: "var(--immersive-stripe-width)",
  borderInlineStartStyle: "solid",
  borderInlineStartColor: "var(--color-speaker)",
};

/** The rationed accent glow on the sanctioned ::before carrier (the hearth-hero precedent: a chromatic glow
 *  on an element's OWN box-shadow is the generated-UI tell `design-audit-checks.ts` classifies). */
const GLOW =
  "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-(--radius-card) before:opacity-30 before:shadow-glow before:content-['']";

export function CorpusUnderstandingInvitation(): ReactElement {
  const titleId = useId();
  const pass = useUnderstandingPass();
  // The live tail for whichever run currently holds the floor; a null id detaches the room.
  useUnderstandingPassTail(pass.liveRunId, pass.onLiveMessage);
  return (
    <Card aria-labelledby={titleId} className={GLOW} data-corpus-focal="invitation" role="group" style={STRIPE}>
      {/* The action column drops UNDER the prose at a narrow pane rather than squeezing the reading line:
          a paragraph capped at its measure beside a button that never shrinks is how a 360px pane ends up
          rendering four words a line. */}
      <Row align="start" className="flex-col @lg:flex-row" gap="block" justify="between">
        <Stack className="min-w-0" gap="row">
          <Heading id={titleId} level={2} voice="focal">
            {pass.running ? "Reading your library back to you." : "Read your library back to you."}
          </Heading>
          {/* Capped on the PARAGRAPH, never on the page (the `reading` voice's own contract). */}
          <Text className="max-w-(--reading-measure)" voice="reading">
            {pass.running
              ? "Distill characters is running, then Compute themes follows on it. Every panel on this page fills in as the results land — you can leave this screen, the pass keeps going."
              : "Everything you have written lives here, but until the understanding pass runs your library can only tell you its shape, not its story. This runs Distill characters, then Compute themes — both read the same portrait and card embeddings the families already use, and every panel on this page fills in."}
          </Text>
          <UnderstandingPassProgress pass={pass} />
        </Stack>
        <Stack className="shrink-0" gap="tight">
          {pass.running ? null : (
            <Button data-slot="understanding-pass-run" disabled={pass.starting} intent="primary" onClick={pass.start}>
              <Icon icon={Sparkles} size="sm" />
              {pass.failure === null ? "Run the understanding pass" : "Try the understanding pass again"}
            </Button>
          )}
          {/* The full runs console is still one click away — it just is not where the work starts any more. */}
          <Button intent="ghost" onClick={(): void => openSettingsTo("workloads", "jobs")} size="sm">
            {pass.running ? "Watch in Settings → Jobs" : "All jobs in Settings → Jobs"}
          </Button>
        </Stack>
      </Row>
    </Card>
  );
}

/** The run's own state under the prose: the live stage + its latest line while it runs, the last failure's
 *  reason when it did not finish. Neither is a NUMBER — these two kinds report sentences (see the hook). */
function UnderstandingPassProgress({ pass }: { readonly pass: UnderstandingPassView }): ReactElement | null {
  if (pass.running) {
    return (
      <Stack data-slot="understanding-pass-progress" gap="tight">
        {/* Indeterminate by construction: neither pass reports a count, so a bar with a number would be
            inventing one. `aria-live` is the Progress primitive's own. */}
        <Progress label={pass.stage ?? "Working"} showValue={false} value={null} />
        {pass.detail === null ? null : <Text voice="gloss">{pass.detail}</Text>}
      </Stack>
    );
  }
  if (pass.failure === null) {
    return null;
  }
  return (
    <Text className="text-destructive" data-slot="understanding-pass-failure" voice="gloss">
      {`The last understanding pass stopped: ${pass.failure}`}
    </Text>
  );
}
