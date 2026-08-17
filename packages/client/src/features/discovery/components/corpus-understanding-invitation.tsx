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
// THE DOOR IS THE REAL ONE, not a re-implementation (the `corpus-run-job-empty-state.tsx` ruling, which
// this island shares and does not duplicate): Settings → Jobs is where running a workload lives, features
// never import each other, and `openSettingsTo` is the shell's deep-link seam. The prose therefore names
// the two jobs by their PICKER LABELS verbatim (`WORKLOAD_KIND_LABELS`: "Distill characters", "Compute
// themes") so the instruction and the list the door opens agree word for word, and the button's trailing
// ellipsis is this app's convention for "this opens a picker" — the label does not promise a one-click run
// the picker does not give.
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
import { Heading, Text } from "@orb/ui/text";
import type { CSSProperties, ReactElement } from "react";
import { useId } from "react";
import { openSettingsTo } from "#state";

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
  return (
    <Card aria-labelledby={titleId} className={GLOW} data-corpus-focal="invitation" role="group" style={STRIPE}>
      {/* The action column drops UNDER the prose at a narrow pane rather than squeezing the reading line:
          a paragraph capped at its measure beside a button that never shrinks is how a 360px pane ends up
          rendering four words a line. */}
      <Row align="start" className="flex-col @lg:flex-row" gap="block" justify="between">
        <Stack className="min-w-0" gap="row">
          <Heading id={titleId} level={2} voice="focal">
            Read your library back to you.
          </Heading>
          {/* Capped on the PARAGRAPH, never on the page (the `reading` voice's own contract). */}
          <Text className="max-w-(--reading-measure)" voice="reading">
            Everything you have written lives here, but until the understanding pass runs your library can only tell you its shape, not its story. Run Distill
            characters, then Compute themes — both read the same portrait and card embeddings the families already use, and every panel on this page fills in.
          </Text>
        </Stack>
        <Stack className="shrink-0" gap="tight">
          <Button intent="primary" onClick={(): void => openSettingsTo("workloads", "jobs")}>
            <Icon icon={Sparkles} size="sm" />
            Run the understanding pass…
          </Button>
          {/* The affordance names its own destination — the ellipsis says "a picker", this says which one. */}
          <Text voice="gloss">Opens Settings → Jobs.</Text>
        </Stack>
      </Row>
    </Card>
  );
}
