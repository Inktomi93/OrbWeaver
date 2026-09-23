// The refinery LANDING (the empty-states mock, frame 1 + FORK J): the section's promise sentence, the
// PICKER, and the three-step teaching row under it. "Nothing is written until you accept" is stated up
// front — the feature's safety story. On a phone this composition reflows to one column (container-driven;
// the shell owns the macro flip).
//
// ── THE PICKER IS THE LANDING'S JOB (owner ruling, 2026-08-17, #157) ─────────────────────────────────
// Verbatim: "the landing for that is wasted" — and, on the walk that produced it, "I have to go allll the
// way down going over a bunch of other stuff to pick a character". This composition used to open on the
// promise sentence, a BUTTON that revealed a picker, and the teaching row; the picker itself was a
// conditional card BELOW all of it, so the primary act of the whole surface was two presses and a scroll
// away. The picker is now first, mounted open, with the teaching material following it. What that costs,
// stated rather than hidden: the reveal button is gone, so the landing always pays for the
// `character.list` read — which the resume decision's list read was already paying for on the same
// paint, and which is what makes the full-library browse (#157's scope add) reachable at all.
//
// THE PENDING GATE MOVED INTO THE DECISION, NOT ONTO A CONTROL. `starting` used to also carry "the list
// the resume-vs-mint check reads has not landed", which disabled the door in the pane's own first frames —
// a dead-looking primary at cold open, i.e. the sibling of the defect #157 is about. `useOpenRefinery`
// awaits that list at CLICK time instead, so the only thing left to say here is that a start is already
// in flight, and the pane says it in words rather than by greying its one affordance.
//
// ── NO 01/02/03 MARKERS — THE MOCK LOSES THIS ONE (owner ruling, board 2026-08-09) ───────────────────
// The empty-states mock draws each step behind a big `01`/`02`/`03` numeral,
// and this component shipped it verbatim as a `<Text voice="datum">`. The R3
// graduation side-eye filed it as a house-taste question
// (2026-08-09 P3: "01/02/03 markers
// (mock-sanctioned — house-taste question)"), and the owner ruled,
// verbatim: **"01/02/03 markers = REDRAW without numbers (the §6 ban stays absolute; mock loses this
// one)"**. A mock is evidence, not authority — where it and the house ban disagree, the ban wins.
// (Honest note for the next reader: that ruling's "§6" cites a ban whose TEXT is not findable in
// docs/ — swept for `numbered`/`numeral`/`house-ban`/`no numbers` across docs/ and enumerated every
// core doc's §6 heading, nothing matches. The board row above is therefore the law this file obeys,
// and the §6 pointer is recorded as-cited rather than silently repaired.)
//
// WHAT CARRIES THE SEQUENCE INSTEAD: the stage's own GLYPH + NAME, in stage order, with a chevron
// between cells — the same "Score → rewrite → analyze" flow the EmptyState title already spells in
// words, drawn. The chevrons are decorative (`Icon` is `aria-hidden` without a `label`), so the order a
// screen reader gets is DOM order — which is the real sequence — rather than three orphan numerals read
// as data. The COPY is untouched: every `name`/`detail` string below is the praised mock text verbatim.

import type { CharacterId } from "@orb/kit/ids";
import { Card } from "@orb/ui/card";
import type { LucideIcon } from "@orb/ui/icons";
import { ChartColumn, ChevronRight, Gauge, Icon, Pencil } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CharacterPicker } from "#components";
import { skeletonRowCountFor } from "#data";
import { testId } from "#lib";
import { useLandingPickerFocusOnRequest } from "../hooks/use-landing-picker-focus.ts";

export interface TeachingStateProps {
  readonly onStart: (characterId: CharacterId) => void;
  /** A start is already in flight. The picker stays MOUNTED and readable — this states what is happening
   *  above it rather than greying the surface's one affordance (header). A second pick while the first is
   *  in flight is swallowed here, so the busy line is the whole of what the user needs told. */
  readonly starting: boolean;
}

interface TeachingStep {
  /** The stage's glyph — the sequence marker's replacement, paired with the name it belongs to. */
  readonly glyph: LucideIcon;
  readonly name: string;
  readonly detail: string;
}

/** The reserved list box, in px — the SAME length as the `h-80` utility beside it (20rem at the 16px root).
 *  Two spellings of one number because the box is set in CSS and the skeleton's row count is arithmetic;
 *  they are adjacent and stated so they move together. */
const PICKER_LIST_HEIGHT_PX = 320;
/** `CharacterPicker`'s own fallback count, used when the tokens cannot be resolved (no document). */
const DEFAULT_PICKER_SKELETON_ROWS = 5;

const STEPS: readonly TeachingStep[] = [
  { glyph: Gauge, name: "Score", detail: "A critique per field, with a 1-10 and what to fix." },
  { glyph: Pencil, name: "Rewrite", detail: "Only the fields you selected, using the score and your guidance." },
  // #104 item 4: this shouted ORIGINAL in caps mid-sentence, which is the one place the app raises its
  // voice at the reader. The distinction it was shouting is real and survives in words: "your original
  // card" against "the previous rewrite" is the contrast, and the sentence carries it without caps or a
  // dash. Micro-caps are the `kicker` VOICE's job (a label), never emphasis inside prose.
  { glyph: ChartColumn, name: "Analyze", detail: "Compares the rewrite against your original card, never against the previous rewrite." },
];

export function TeachingState({ onStart, starting }: TeachingStateProps): ReactElement {
  // The desktop list's empty-state CTA focuses THIS picker rather than opening a second one over it
  // (#307). The ref rides the root; the hook focuses+scrolls the picker's search field when the CTA bumps
  // the landing-focus nonce. At mount the nonce is 0, so nothing is stolen on first paint.
  const focusRef = useLandingPickerFocusOnRequest();
  return (
    <Stack align="center" data-testid={testId("refineryTeaching")} gap="section" padding="section" ref={focusRef}>
      <Stack align="center" className="max-w-(--reading-measure)" gap="tight">
        {/* `text-center` on BOTH lines, not just the gloss: the Stack centres each child as a BLOCK, so a
            two-line heading at the reading measure sat left-aligned above a centred sentence — two
            different axes in one four-line block (measured in the CT shot at 1280px). */}
        <Heading className="text-center" level={2} voice="masthead">
          Score → rewrite → analyze a card without drifting from your original
        </Heading>
        {/* READING, NOT GLOSS (side-eye 2026-08-19 P2). This is the SAFETY PROMISE the whole feature rests
            on — "nothing is written until you accept" — and it shipped at the 10.5px `gloss` step, the
            register this app uses for incidental captions. The measure came with it: `--reading-measure`
            is 75ch resolved at the element's OWN font size, so a 75ch cap inherited from the Stack let a
            10.5px child run to ~87 characters. `reading` is the voice for the content itself, and its own
            note says the cap belongs on the PARAGRAPH — so it moves here, where the two now agree.
            SINCE #1145 the token here is `--reading-measure-prose`, not the house one: 75 CSS `ch` is
            ~117 of the characters the design law counts, so the wide measure could never satisfy it. The
            Stack, Card and steps Grid around this paragraph keep `--reading-measure` — they bound a
            picker and three step cards, which are layout, not a line of prose. */}
        <Text className="max-w-(--reading-measure-prose) text-center" voice="reading">
          Pick a character to start. Nothing is written to the card until you accept a rewrite field by field.
        </Text>
      </Stack>
      {/* THE LANDING'S JOB (header). Mounted open, first, and full-library — `CharacterPicker` walks the
          whole keyset now, so this is the same browse the characters section offers, not its first page. */}
      <Card className="w-full max-w-(--reading-measure)">
        <Stack gap="row" padding="block">
          <Text voice="kicker">{starting ? "Opening the session…" : "Start from a character"}</Text>
          {/* THE LIST BOX IS RESERVED, NOT FLUID (side-eye 2026-08-19 P3: "+98px post-paint jump"). The
              picker suspends into `SkeletonRows`, and the settled list is taller than the fallback — so
              everything under it, the whole teaching row included, was shoved down one paint after the
              landing appeared. The config-welcome precedent is the same class and the same answer: paint
              the box you will settle into. `h-80` fixes the scroller at the height its own `max-h-80`
              default was already capping it to, and the skeleton fills that SAME box — `skeletonRowCountFor`
              inverts the fallback's own pitch from token values, so the count follows a coarse-pointer
              row height instead of a guess. */}
          <CharacterPicker
            emptyText="No characters match."
            label="Start a refinery session"
            listClassName="h-80"
            onSelect={(id): void => {
              if (!starting) {
                onStart(id);
              }
            }}
            placeholder="Search characters…"
            reserveKey="refinery.landingPicker"
            skeletonCount={skeletonRowCountFor(PICKER_LIST_HEIGHT_PX, DEFAULT_PICKER_SKELETON_ROWS)}
          />
        </Stack>
      </Card>
      {/* EQUAL BASES, NOT A WRAPPING FLEX ROW (side-eye 2026-08-19 P2). The wrap fixed the clipping this
          block's previous note describes — at the 358px phone pane the row rendered 448px wide and hung off
          both edges — but content-sized cells inside it drew the three steps of ONE pipeline as a staircase
          (measured 279/384/482px), so the step with the longest sentence read as the biggest one. A
          three-track grid gives each step exactly a third and stacks to ONE column below the container step
          (`gridVariants.triple`), which is the same "reflows to one column on a phone" this file's header
          promises — now expressed as tracks rather than as slack.
          The MECHANISM the wrap fix minted is preserved, not reverted: each chevron still lives inside its
          own step's unit (see below), which is what kept it from orphaning. What changed is the ARM — the
          reflow is a track count now, so there is no wrap point for a chevron to strand at in the first
          place. */}
      <Grid className="w-full max-w-(--reading-measure)" cols="triple" data-testid={testId("refineryTeachingSteps")} gap="tight">
        {STEPS.map((step, index) => (
          // EACH CHEVRON+CARD IS ONE UNIT (side-eye 2026-08-09 P2, preserved). The chevron is a child of
          // its OWN step, never a free child of the steps row — that is what stopped it stranding at the
          // end of a line pointing at nothing when the next cell reflowed away from it. It holds here for
          // the stacked arm too: a step and its chevron are one grid cell, so they move together by
          // construction.
          <Row align="center" gap="tight" key={step.name}>
            {/* ROTATED WHERE THE FLOW IS (side-eye 2026-08-19): stacked, the sequence runs DOWNWARD and a
                right-pointing chevron between two cells points at the pane's edge. `rotate-90` turns the
                same decoration to face the way the eye actually travels; above the step it is horizontal
                again. It is decoration either way (`Icon` with no `label` is `aria-hidden`), so nothing
                about the announced order changes — that is DOM order, which is the real sequence. */}
            {index === 0 ? null : <Icon className="rotate-90 @md:rotate-0" icon={ChevronRight} size="sm" />}
            <Card className="h-full flex-1">
              <Stack gap="tight" padding="block">
                <Row align="center" gap="tight">
                  <Icon icon={step.glyph} size="sm" />
                  <Text voice="label">{step.name}</Text>
                </Row>
                <Text voice="gloss">{step.detail}</Text>
              </Stack>
            </Card>
          </Row>
        ))}
      </Grid>
    </Stack>
  );
}
