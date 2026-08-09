// The no-selection TEACHING state (the empty-states mock, frame 1 + FORK J): the section's own promise
// sentence, the three-step teaching row, and the character door. "Nothing is written until you accept"
// is stated up front — the feature's safety story. On a phone this composition reflows to one column
// (container-driven; the shell owns the macro flip).
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
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { EmptyState } from "@orb/ui/empty-state";
import type { LucideIcon } from "@orb/ui/icons";
import { ChartColumn, ChevronRight, Gauge, Icon, Pencil } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker } from "#components";
import { testId } from "#lib";

export interface TeachingStateProps {
  readonly onStart: (characterId: CharacterId) => void;
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
  { glyph: ChartColumn, name: "Analyze", detail: "Compares the rewrite against your ORIGINAL — never the previous rewrite." },
];

export function TeachingState({ onStart, starting }: TeachingStateProps): ReactElement {
  const [picking, setPicking] = useState(false);
  return (
    <Stack align="center" data-testid={testId("refineryTeaching")} gap="section" padding="section">
      <EmptyState
        action={
          <Button disabled={starting} onClick={(): void => setPicking(true)} size="md">
            Pick a character
          </Button>
        }
        description="Pick a character to start. Nothing is written to the card until you accept a rewrite field by field."
        title="Score → rewrite → analyze a card without drifting from your original"
      />
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
      {picking ? (
        <Card>
          <Stack gap="row" padding="block">
            <Text voice="kicker">Start from a character</Text>
            <CharacterPicker
              emptyText="No characters match."
              label="Start a refinery session"
              onSelect={(id): void => {
                setPicking(false);
                onStart(id);
              }}
              placeholder="Search characters…"
            />
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
