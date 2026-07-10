// The below-field token counter (FINAL-Character §6.3) — a pure presentational leaf: a right-aligned mono
// "~N tokens" line. EVERY prompt-bearing card field carries one, computed LIVE off the draft via the ONE
// kit estimator (`@orb/kit/tokens` `estimateTokens`) at the call site (a `form.Subscribe` over that field);
// this component only renders the resolved number. Fields that never reach the model (creatorNotes,
// provenance, unrecognized data) get NO counter — don't imply they cost tokens.

import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface CharacterTokenCounterProps {
  readonly tokens: number;
}

/** "~N tokens" — the mono data accent (§13: mono for counts), right-aligned under its field. */
export function CharacterTokenCounter({ tokens }: CharacterTokenCounterProps): ReactElement {
  return (
    <Row gap="row" align="center" className="justify-end">
      <Text size="micro" tone="muted" className="font-mono">
        ~{tokens} tokens
      </Text>
    </Row>
  );
}
