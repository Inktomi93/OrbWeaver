// The SEEDED GREETING's swipe strip — steps the row through its character card's `greetings[]` alternates
// (`[0]` = the first message, the rest = ST "alternate greetings"). Same chrome as the committed `SwipeStrip`
// (`n / m` counter + prev/next chevrons) so a greeting behaves identically to a real swipe; only the source
// and the verb differ.
//
// IT USED TO WRITE A CLIENT STORE (chat-creation-draft-mode-replacement.md §4.8 / fork F6). Before R1 a
// pre-send room had no chat row, so this strip wrote the picked text into `draft-config-store` and the first
// send carried it to `startChat`. R1 deleted that store — the greeting is REAL CANON from the creation click
// — and the affordance went dark until this (R3). It now fires `chat.setSeededGreeting`, which is:
//   • HOST-only (a seeded greeting has no human author, so author-or-host would collapse to host anyway);
//   • WINDOWED — the server refuses `greeting_frozen` once the first user turn has baked the row. The caller
//     is expected not to offer the control past that point (`ChatThread` only binds it inside the window),
//     so a refusal here means the client's view of the window was stale, not that the user did something
//     wrong — which is why the toast is soft;
//   • INDEX-carrying. The wire has no text: the server resolves the alternate from the card. That is what
//     keeps a host-gated door from becoming a second free-text content write beside `editMessage`.
//
// The shown index is DERIVED from the current text (`variants.indexOf(current)`): text matching an alternate
// shows its position; a hand-EDITED greeting (no match, idx -1) shows "— / m" and steps to the last/first
// alternate on prev/next — never a dead strip. Rendered by `message-row.tsx` only when there are ≥2
// alternates AND the room is still in its window.

import type { ChatId, MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronLeft, ChevronRight, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";

interface SetSeededGreetingVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly greetingIndex: number;
}

// busDriven: the verb emits `messageEdited`, which the invalidation seam already routes to the canon read —
// the row re-renders from the SERVER's bytes, never from an optimistic local swap (the card is the source of
// truth for what an alternate says, and it may have been edited since the seed).
const useSetSeededGreeting = createEntityMutation<SetSeededGreetingVars, unknown>({
  options: (trpc) => trpc.chat.setSeededGreeting.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch to that greeting.",
});

export interface GreetingSwipeStripProps {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  /** The character card's `greetings[]` — the alternates this strip steps through. */
  readonly variants: readonly string[];
  /** The currently shown greeting text (the row's content) — the strip derives its position from it. */
  readonly current: string;
}

/** The `n / m` greeting-alternate counter + prev/next for a seeded greeting row. */
export function GreetingSwipeStrip({ chatId, messageId, variants, current }: GreetingSwipeStripProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const step = useSetSeededGreeting({ trpc, invalidation });

  const total = variants.length;
  const currentIdx = variants.indexOf(current);
  const atCustom = currentIdx === -1;
  const canPrev = atCustom || currentIdx > 0;
  const canNext = atCustom || currentIdx < total - 1;
  const prevIdx = atCustom ? total - 1 : currentIdx - 1;
  const nextIdx = atCustom ? 0 : currentIdx + 1;

  const pick = (idx: number): void => {
    if (step.isPending || variants[idx] === undefined) {
      return;
    }
    step.mutate({ chatId, messageId, greetingIndex: idx });
  };

  return (
    <Row gap="field" align="center" data-slot="greeting-swipe-strip">
      <Button
        intent="ghost"
        size="icon"
        disabled={!canPrev || step.isPending}
        loading={step.isPending}
        aria-label="Previous greeting"
        onClick={(): void => pick(prevIdx)}
      >
        <Icon icon={ChevronLeft} size="sm" />
      </Button>
      {/* Same counter, same `datum` voice as the settled row's swipe strip — one grammar for both. */}
      <Text as="span" voice="datum">
        {atCustom ? "—" : currentIdx + 1} / {total}
      </Text>
      <Button
        intent="ghost"
        size="icon"
        disabled={!canNext || step.isPending}
        loading={step.isPending}
        aria-label="Next greeting"
        onClick={(): void => pick(nextIdx)}
      >
        <Icon icon={ChevronRight} size="sm" />
      </Button>
    </Row>
  );
}
