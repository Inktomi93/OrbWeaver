// The SEEDED GREETING's swipe strip — steps the row through its character card's `greetings[]` alternates
// (`[0]` = the first message, the rest = ST "alternate greetings"). Same chrome as the committed `SwipeStrip`
// (`n / m` counter + prev/next chevrons) so a greeting behaves identically to a real swipe; only the source
// and the verb differ.
//
// IT USED TO WRITE A CLIENT STORE (D166). Before R1 a
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
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { cn } from "#lib";
import { PAGER_CHIP, PAGER_CHIP_COMPACT, PAGER_COUNTER, PAGER_TRACK } from "../lib/pager-chrome.ts";

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
  /** #221 — the row-owned wallpaper backing, threaded exactly as `SwipeStrip` takes it: the two strips
   *  share one slot and one chrome, so they cannot differ on whether that chrome is legible over art. */
  readonly backingClass?: string | undefined;
}

/** The `n / m` greeting-alternate counter + prev/next for a seeded greeting row. */
export function GreetingSwipeStrip({ chatId, messageId, variants, current, backingClass }: GreetingSwipeStripProps): ReactElement {
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
    // Sized to its content like its twin (#228): the two strips share one slot and one chrome, so a plate
    // that spans the whole message width on one of them and hugs the chevrons on the other would be the
    // drift this pair's threading exists to prevent.
    //
    // TRAILING-EDGE ALIGNED (#312), for the same reason and by the same lever as `SwipeStrip`: the two
    // strips share one slot, so they cannot differ on which edge the chevrons pack to. The chip rides the
    // content column's right edge instead of its left-by-omission — via `PAGER_CHIP`'s auto margin since
    // #608 (same edge, defined overflow direction; `self-end` put an overflowing chip off the pane).
    // AND IT MAY NOT SIZE THE BUBBLE'S COLUMN EITHER (#598, same slot ⇒ same track). The content column
    // resolves to the max-content of its widest child, so a `w-fit` chip under a SHORT greeting became that
    // child and hung past the bubble it pages. `container-type: inline-size` (Tailwind's `@container`)
    // resolves this track's width without regard to its contents: it contributes nothing to the column and
    // still stretches to whatever the bubble set. The track is here because the two strips share one slot and
    // must not differ on whether a pager can widen the message it pages.
    //
    // AND IT MAY NOT BE CRUSHED EITHER (#608, `PAGER_CHIP`/`PAGER_CHIP_COMPACT` — one chrome, both strips):
    // `w-fit` resolved this chip against the BUBBLE once the track contained the column, so under a short
    // greeting at a coarse pointer its chevrons squeezed under the 48px box and the counter wrapped. `w-max`
    // plus the compact arms is the same answer its twin takes, for the same reason. This chip carries no
    // kicker (it never took #490's word), so it needs no LABEL stand-down — it takes the other two, which are
    // the ones that keep a 48px touch box under a narrow greeting.
    <Stack data-slot="greeting-swipe-strip-track" className={PAGER_TRACK}>
      <Row gap="field" align="center" data-slot="greeting-swipe-strip" className={cn(PAGER_CHIP, PAGER_CHIP_COMPACT, backingClass)}>
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
        {/* Same counter, same `datum` voice, same compaction as the settled row's swipe strip — one grammar
            for both, down to when the spaces around the slash stand down (#608). */}
        <Text as="span" voice="datum" data-slot="greeting-swipe-strip-counter" className={PAGER_COUNTER}>
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
    </Stack>
  );
}
