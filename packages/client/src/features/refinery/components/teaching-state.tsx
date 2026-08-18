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
// `character.list` read — which the resume decision's roster read was already paying for on the same
// paint, and which is what makes the full-library browse (#157's scope add) reachable at all.
//
// THE PENDING GATE MOVED INTO THE DECISION, NOT ONTO A CONTROL. `starting` used to also carry "the roster
// the resume-vs-mint check reads has not landed", which disabled the door in the pane's own first frames —
// a dead-looking primary at cold open, i.e. the sibling of the defect #157 is about. `useOpenRefinery`
// awaits that roster at CLICK time instead, so the only thing left to say here is that a start is already
// in flight, and the pane says it in words rather than by greying its one affordance.
//
// ── NO 01/02/03 MARKERS — THE MOCK LOSES THIS ONE (owner ruling, board 2026-08-09) ───────────────────
// The empty-states mock draws each step behind a big `01`/`02`/`03` numeral (docs/design/mocks/refinery/
// empty-states.html:165), and this component shipped it verbatim as a `<Text voice="datum">`. The R3
// graduation side-eye filed it as a house-taste question (docs/reviews/side-eye/2026-08-09-refinery-
// graduation.md P3: "01/02/03 markers (mock-sanctioned — house-taste question)"), and the owner ruled,
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
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CharacterPicker } from "#components";
import { testId } from "#lib";

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
  return (
    <Stack align="center" data-testid={testId("refineryTeaching")} gap="section" padding="section">
      <Stack align="center" className="max-w-(--reading-measure)" gap="tight">
        {/* `text-center` on BOTH lines, not just the gloss: the Stack centres each child as a BLOCK, so a
            two-line heading at the reading measure sat left-aligned above a centred sentence — two
            different axes in one four-line block (measured in the CT shot at 1280px). */}
        <Heading className="text-center" level={2} voice="masthead">
          Score → rewrite → analyze a card without drifting from your original
        </Heading>
        <Text className="text-center" voice="gloss">
          Pick a character to start. Nothing is written to the card until you accept a rewrite field by field.
        </Text>
      </Stack>
      {/* THE LANDING'S JOB (header). Mounted open, first, and full-library — `CharacterPicker` walks the
          whole keyset now, so this is the same browse the characters section offers, not its first page. */}
      <Card className="w-full max-w-(--reading-measure)">
        <Stack gap="row" padding="block">
          <Text voice="kicker">{starting ? "Opening the session…" : "Start from a character"}</Text>
          <CharacterPicker
            emptyText="No characters match."
            label="Start a refinery session"
            onSelect={(id): void => {
              if (!starting) {
                onStart(id);
              }
            }}
            placeholder="Search characters…"
          />
        </Stack>
      </Card>
      {/* WRAPS. `Row` is a non-wrapping flex row, and this composition is centred — so at the phone
          CONTENT pane (measured: 358px against a 448px row) the cells hung off BOTH edges and the Score
          cell's left half was CUT AWAY by the pane. That predates the redraw (the numeral cells had the
          same anatomy) and the two new chevrons only widen it, so it is fixed here rather than carried
          forward: `flex-wrap` is what finally makes this file's own header line — "on a phone this
          composition reflows to one column" — true instead of aspirational. Plain utilities, no
          arbitrary values; `justify-center` keeps a short final line centred under the promise sentence. */}
      <Row align="center" className="flex-wrap justify-center" data-testid={testId("refineryTeachingSteps")} gap="tight">
        {STEPS.map((step, index) => (
          // EACH CHEVRON+CARD IS ONE NON-WRAPPING UNIT (side-eye 2026-08-09 P2). A default `Row` never
          // wraps, so a step's leading chevron travels WITH its card when that card reflows to the next
          // line — instead of stranding at the end of line 1 pointing at nothing (the orphan the Fragment
          // layout left when Analyze wrapped). The OUTER row still wraps between units; `gap="tight"` on
          // both reproduces the flat spacing the Fragment layout had.
          <Row align="center" gap="tight" key={step.name}>
            {index === 0 ? null : <Icon icon={ChevronRight} size="sm" />}
            <Card>
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
      </Row>
    </Stack>
  );
}
