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
import { Container, Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { openConfigTo } from "#state";
import type { UnderstandingPassView } from "../hooks/use-understanding-pass.ts";
import { useUnderstandingPass, useUnderstandingPassTail } from "../hooks/use-understanding-pass.ts";

/** The rationed accent glow on the sanctioned ::before carrier (the hearth-hero precedent: a chromatic glow
 *  on an element's OWN box-shadow is the generated-UI tell `design-audit-checks.ts` classifies).
 *
 *  ONE CARRIER, AT FULL STRENGTH (#244 P2-1). This island carried the same accent border-left + 30%-dimmed
 *  ring as the family map, and goes the same way for the same reasons — the stripe is `design-audit`'s
 *  `side-tab` (a §6 absolute ban) plus `border-accent-on-rounded` on a rounded Card, and the dim came from
 *  the config hearth where a hover lifts it back. The two focal islands MUST agree: they are the same slot
 *  in two phases of one surface, and a treatment that changed between them would read as a different kind
 *  of thing rather than the same page after a pass ran. */
const GLOW =
  "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-(--radius-card) before:shadow-glow before:content-['']";

/** `Progress` takes Base UI's 0–100 scale (its default `max`); the hook reports a 0–1 fraction. */
const PERCENT = 100;

export function CorpusUnderstandingInvitation(): ReactElement {
  const titleId = useId();
  const pass = useUnderstandingPass();
  // The live tail for whichever run currently holds the floor; a null id detaches the room.
  useUnderstandingPassTail(pass.liveRunId, pass.onLiveProgress);
  return (
    <Card aria-labelledby={titleId} className={GLOW} data-corpus-focal="invitation" role="group">
      {/* THE ISLAND IS ITS OWN QUERY CONTEXT. `@lg` below has to mean "this island is 32rem wide", and an
          element cannot query itself — without a `Container` here the nearest `@container` is the SURFACE,
          so the moment the surface split into two tracks (#244 P1-2) the island shrank to 508px while its
          own query still read the 868px pane and kept the two columns. Measured: the prose column fell to
          ~230px, four words a line, beside a `shrink-0` action column — exactly the failure the comment
          below describes, arriving from the other direction. */}
      <Container className="w-full">
        {/* The action column drops UNDER the prose at a narrow pane rather than squeezing the reading line:
            a paragraph capped at its measure beside a button that never shrinks is how a 360px pane ends up
            rendering four words a line. */}
        <Row align="start" className="flex-col @lg:flex-row" gap="block" justify="between">
          <Stack className="min-w-0" gap="row">
            <Heading id={titleId} level={2} voice="focal">
              {pass.running ? "Reading your library back to you." : "Read your library back to you."}
            </Heading>
            {/* Capped on the PARAGRAPH, never on the page (the `reading` voice's own contract). */}
            <Text className="max-w-(--reading-measure-prose)" voice="reading">
              {passProse(pass)}
            </Text>
            {pass.memoryDisabled ? <MemoryOffNote /> : null}
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
            <Button intent="ghost" onClick={(): void => openConfigTo("workloads", "jobs")} size="sm">
              {pass.running ? "Watch in Settings → Jobs" : "All jobs in Settings → Jobs"}
            </Button>
          </Stack>
        </Row>
      </Container>
    </Card>
  );
}

/**
 * The invitation's paragraph, which has to state the CHAIN TRUTHFULLY (issue #166).
 *
 * The shipped copy said the two jobs "both read the same portrait and card embeddings the families already
 * use". That was false in the way that matters: `Compute themes` clusters MEMORY DIGESTS — the summaries of
 * your chats — and reads neither portraits nor cards. A user with no chat history therefore read a promise
 * the pass could not keep, and the run reported success having written nothing. The copy now names each
 * stage's actual input, and when memory is off it says which stage is absent instead of implying it ran.
 */
function passProse(pass: UnderstandingPassView): string {
  if (pass.running) {
    return pass.memoryDisabled
      ? "Distill characters is running. Every panel on this page fills in as the results land — you can leave this screen, the pass keeps going."
      : "Distill characters is running, then Memory backfill, then Compute themes. Every panel on this page fills in as the results land — you can leave this screen, the pass keeps going.";
  }
  return pass.memoryDisabled
    ? "Everything you have written lives here, but until the understanding pass runs your library can only tell you its shape, not its story. This runs Distill characters, which reads every card into a genre, a tone and a pitch."
    : "Everything you have written lives here, but until the understanding pass runs your library can only tell you its shape, not its story. This runs Distill characters over your cards, then Memory backfill over your chats, then Compute themes over those chat summaries — and every panel on this page fills in.";
}

/** Story themes are built from chat summaries, so with memory off the pass genuinely cannot produce them.
 *  Saying so — with the switch — is the honest alternative to enqueueing a stage that would refuse. */
function MemoryOffNote(): ReactElement {
  return (
    <Row align="center" data-slot="understanding-pass-memory-off" gap="field">
      <Text voice="gloss">Story themes need chat memory, which is off — this pass will read your cards only.</Text>
      <Button intent="ghost" onClick={(): void => openConfigTo("chat-behavior", "memory")} size="sm">
        Turn on memory
      </Button>
    </Row>
  );
}

/** The run's own state under the prose: the live stage + its latest line while it runs, the last failure's
 *  reason when it did not finish. */
function UnderstandingPassProgress({ pass }: { readonly pass: UnderstandingPassView }): ReactElement | null {
  if (pass.running) {
    return (
      <Stack data-slot="understanding-pass-progress" gap="tight">
        {/* DETERMINATE WHEN THE PRODUCER COUNTS, indeterminate when it does not (issue #166). A stage that
            enumerates its work reports `current`/`total` and gets a real bar; an atomic k-means reports a
            sentence and keeps the indeterminate one, because a bar with an invented number is worse than no
            bar at all. `aria-live` is the Progress primitive's own. */}
        <Progress label={pass.stage ?? "Working"} showValue={pass.fraction !== null} value={pass.fraction === null ? null : pass.fraction * PERCENT} />
        {pass.detail === null ? null : <Text voice="gloss">{pass.detail}</Text>}
      </Stack>
    );
  }
  if (pass.failure === null) {
    return null;
  }
  return (
    <Text className="text-destructive" data-slot="understanding-pass-failure" voice="gloss">
      {/* A CRASH IS NOT A REFUSAL. `worker_died` means the run never came back — the row has no reason of its
          own to quote, and telling a user "stopped: undefined" is how a failure state reads as a bug in the
          message rather than in the run. It was only visible in Settings → Jobs before issue #166. */}
      {pass.failureWasCrash ? "The last understanding pass stopped unexpectedly — run it again." : `The last understanding pass stopped: ${pass.failure}`}
    </Text>
  );
}
