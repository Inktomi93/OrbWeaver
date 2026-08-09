// The no-selection TEACHING state (the empty-states mock, frame 1 + FORK J): the section's own promise
// sentence, the three-step teaching row, and the character door. "Nothing is written until you accept"
// is stated up front — the feature's safety story. On a phone this composition reflows to one column
// (container-driven; the shell owns the macro flip).

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { EmptyState } from "@orb/ui/empty-state";
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

const STEPS = [
  { n: "01", k: "Score", d: "A critique per field, with a 1-10 and what to fix." },
  { n: "02", k: "Rewrite", d: "Only the fields you selected, using the score and your guidance." },
  { n: "03", k: "Analyze", d: "Compares the rewrite against your ORIGINAL — never the previous rewrite." },
] as const;

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
      <Row gap="tight">
        {STEPS.map((step) => (
          <Card key={step.n}>
            <Stack gap="tight" padding="block">
              <Text voice="datum">{step.n}</Text>
              <Text voice="label">{step.k}</Text>
              <Text voice="gloss">{step.d}</Text>
            </Stack>
          </Card>
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
