// The DRAFT greeting's swipe strip (decision #2) — steps through the founding character's `greetings[]`
// alternates (`[0]` = the first message, the rest = ST "alternate greetings"), writing the picked raw
// text to the draft-config store (`setDraftGreeting`). NO server verb + NO generation: a draft has no
// chat to generate against, so unlike the committed `SwipeStrip` there is no tip-of-history `swipe` that
// mints a fresh sibling — the alternates are a STATIC array. Same chrome (`n / m` counter + prev/next
// chevrons) so a draft greeting behaves identically to a real swipe; only the data source differs.
//
// The shown index is DERIVED from the current text (`variants.indexOf(current)`): text matching an
// alternate shows its position; a hand-EDITED greeting (no match, idx -1) shows "— / m" and steps to the
// last/first alternate on prev/next — never a dead strip. Rendered by `message-row.tsx` only when there
// are ≥2 alternates.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronLeft, ChevronRight, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { setDraftGreeting } from "#state";

export interface GreetingSwipeStripProps {
  readonly draftKey: string;
  readonly characterId: CharacterId;
  /** The founding character's `greetings[]` — the alternates this strip steps through. */
  readonly variants: readonly string[];
  /** The currently shown greeting text (the row's content) — the strip derives its position from it. */
  readonly current: string;
}

/** The `n / m` greeting-alternate counter + prev/next for a draft greeting row. */
export function GreetingSwipeStrip({ draftKey, characterId, variants, current }: GreetingSwipeStripProps): ReactElement {
  const total = variants.length;
  const currentIdx = variants.indexOf(current);
  const atCustom = currentIdx === -1;
  const canPrev = atCustom || currentIdx > 0;
  const canNext = atCustom || currentIdx < total - 1;
  const prevIdx = atCustom ? total - 1 : currentIdx - 1;
  const nextIdx = atCustom ? 0 : currentIdx + 1;

  const pick = (idx: number): void => {
    const text = variants[idx];
    if (text !== undefined) {
      setDraftGreeting(draftKey, characterId, text);
    }
  };

  return (
    <Row gap="field" align="center" data-slot="greeting-swipe-strip">
      <Button intent="ghost" size="icon" disabled={!canPrev} aria-label="Previous greeting" onClick={(): void => pick(prevIdx)}>
        <Icon icon={ChevronLeft} size="sm" />
      </Button>
      {/* Same counter, same `datum` voice as the settled row's swipe strip — one grammar for both. */}
      <Text as="span" voice="datum">
        {atCustom ? "—" : currentIdx + 1} / {total}
      </Text>
      <Button intent="ghost" size="icon" disabled={!canNext} aria-label="Next greeting" onClick={(): void => pick(nextIdx)}>
        <Icon icon={ChevronRight} size="sm" />
      </Button>
    </Row>
  );
}
