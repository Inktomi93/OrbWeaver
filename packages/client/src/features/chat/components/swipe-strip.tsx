// The swipe foot: ‹ `n / m` › grouped at the message's trailing corner, on the
// last assistant message only. Where it sits and how its chevrons meet the edge is the chat style's
// (`RowSkin.swipeFoot`, lib/pager-chrome.ts). Right chevron: at the tip fires swipe (a fresh generation);
// stepped back, it fires selectVariant (a pointer move, no new generation), same as the left chevron. Both
// resolve their target variant id through useVariantHistory, since MessageView carries only the selected
// variant per slot.
//
// THE SECOND `chat.swipe` DOOR, RATIFIED (#568 — budget `chats::chat.swipe: 2`; the other is the wand's
// `fireSwipe`/`fireRewrite` in `use-guided-actions.ts`). This is a READER-SIDE control on the message —
// a pager that also generates at the tip, and the home of the ‹/› keyboard nav — whereas the wand is a
// composer control whose payload carries a `guided` steer this door structurally cannot send. Neither is a
// subset of the other in the sense #539 retired on (same home, strict payload subset), so both stand. The
// budget stays a COUNT rather than a gate exemption: an exempt procedure leaves the census entirely, and a
// third swipe door is exactly what should red here. What the #568 triage did NOT settle is #570: the ✨
// utility menu's "Regenerate" fires `fireSwipe("")`, which is this chevron's tip behaviour exactly — a real
// duplicate RENDERED affordance behind one of the two call sites, ruled there and not here.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronLeft, ChevronRight, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { turnMutationToast, viewerTimeZone } from "#lib";
import { useSwipeKeyboardNav } from "../hooks/use-swipe-keyboard-nav.ts";
import { useVariantHistory } from "../hooks/use-variant-history.ts";
import { VARIANT_GENERATE_NAME, VARIANT_NEXT_NAME, VARIANT_PREV_NAME, variantCountName } from "../lib/message-action-names.ts";
import type { SwipeFoot } from "../lib/pager-chrome.ts";
import { SWIPE_COUNTER } from "../lib/pager-chrome.ts";

interface SwipeVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly timeZone: string;
}

interface SelectVariantVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly timeZone: string;
}

// The ONE turn-error mapper (`lib/turn-abort-notice.ts`), not a bare string: a swipe refused for CONTENTION
// (`locked` — another turn holds this room) is the one turn failure the reader can act on, and the bare
// fallback hid it behind "Couldn't generate that swipe" while the old variant sat there with no ghost.
const useSwipeMutation = createEntityMutation<SwipeVars, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, "Couldn't generate that swipe."),
});

const useSelectVariantMutation = createEntityMutation<SelectVariantVars, unknown>({
  options: (trpc) => trpc.chat.selectVariant.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch to that variant.",
});

export interface SwipeStripProps {
  readonly message: MessageView;
  /** The chat style's swipe treatment. */
  readonly foot: SwipeFoot;
}

/** The foot line both swipe strips share: ‹ n / m › grouped at the trailing corner of the message. The strips
 *  own their verbs; this owns only the arrangement. */
export function SwipeFootRow(props: {
  readonly foot: SwipeFoot;
  readonly slot: string;
  /** The position in words ("Reply 2 of 3"), naming the group for a screen reader. */
  readonly label: string;
  readonly prev: ReactNode;
  readonly count: ReactNode;
  readonly next: ReactNode;
}): ReactElement {
  return (
    <Row align="center" justify="end" gap="tight" data-slot={props.slot} className={props.foot.row} role="group" aria-label={props.label}>
      {props.prev}
      {props.count}
      {props.next}
    </Row>
  );
}

export function SwipeStrip({ message, foot }: SwipeStripProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const swipe = useSwipeMutation({ trpc, invalidation });
  const selectVariant = useSelectVariantMutation({ trpc, invalidation });
  const history = useVariantHistory(message);
  const historyStatusId = useId();

  const { chatId, id: messageId, selectedVariantIdx: idx } = message;
  const total = Math.max(message.variantCount, 1);
  const current = idx + 1;
  const busy = swipe.isPending || selectVariant.isPending;

  // THE BACK EDGE WRAPS; THE FORWARD EDGE DOES NOT (#1874 Finding B, owner-reported 2026-09-07: "you
  // can't hit left swipe arrow when at 1 out of X to loop back around to X"). Both ends used to be
  // hard-stopped, so at `1 / X` the ‹ was a control the reader reaches for that refuses to move.
  //
  // THE ASYMMETRY IS DELIBERATE AND MUST SURVIVE A LATER TIDY-UP: at `X / X` the › is the GENERATE verb,
  // not a step, so wrapping it would silently replace "make a new variant" with "jump to variant 1" — the
  // one act on this strip that costs a model call, swapped for the cheapest one. Cyclic navigation is the
  // ordinary idiom for a bounded pager; a generate button is not part of that cycle. Paired pins in
  // `swipe-strip.ct.tsx` hold both halves, the forward one specifically so "fix the other end for
  // consistency" fails loudly.
  const prevIdx = current > 1 ? idx - 1 : total - 1;
  const prevVariantId = total > 1 ? history.get(prevIdx) : undefined;
  const nextVariantId = current < total ? history.get(idx + 1) : undefined;
  const canStepBack = prevVariantId !== undefined;
  const waitingForNext = current < total && nextVariantId === undefined;

  const goPrev = (): void => {
    if (busy || prevVariantId === undefined) {
      return;
    }
    selectVariant.mutate({ chatId, messageId, variantId: prevVariantId, timeZone: viewerTimeZone() });
  };

  const goNext = (): void => {
    if (busy || waitingForNext) {
      return;
    }
    if (nextVariantId !== undefined) {
      selectVariant.mutate({ chatId, messageId, variantId: nextVariantId, timeZone: viewerTimeZone() });
      return;
    }
    swipe.mutate({ chatId, messageId, timeZone: viewerTimeZone() });
  };

  useSwipeKeyboardNav({ onPrev: goPrev, onNext: goNext });

  // Keep the same navigation geometry at the first variant; the right edge still generates rather
  // than selecting nonexistent history, and its accessible name distinguishes that paid action.
  const nextChevronLabel = current < total ? VARIANT_NEXT_NAME : VARIANT_GENERATE_NAME;

  return (
    <Stack gap="tight">
      <SwipeFootRow
        foot={foot}
        slot="swipe-strip"
        label={variantCountName(current, total)}
        prev={
          <Button
            intent="ghost"
            size="glyph-lg"
            shape="pill"
            className={foot.chevron}
            disabled={!canStepBack}
            loading={busy && canStepBack}
            aria-label={VARIANT_PREV_NAME}
            onClick={goPrev}
          >
            <Icon icon={ChevronLeft} size="sm" />
          </Button>
        }
        count={
          // A VALUE you read — the `datum` voice, whose tabular figures stop the count nudging the chevron as
          // it ticks (UI-Density-Law.md §2.3). The position and nothing else: owner ruling, a label is noise.
          <Text as="span" voice="datum" aria-hidden="true" data-slot="swipe-strip-counter" className={SWIPE_COUNTER}>
            {current} / {total}
          </Text>
        }
        next={
          <Button
            intent="ghost"
            size="glyph-lg"
            shape="pill"
            className={foot.chevron}
            disabled={waitingForNext}
            loading={busy || waitingForNext}
            aria-label={nextChevronLabel}
            aria-describedby={waitingForNext ? historyStatusId : undefined}
            onClick={goNext}
          >
            <Icon icon={ChevronRight} size="sm" />
          </Button>
        }
      />
      {waitingForNext ? (
        <Text as="span" id={historyStatusId} voice="label" className="text-muted-foreground" role="status">
          Loading variant history…
        </Text>
      ) : null}
    </Stack>
  );
}

/** An earlier swiped reply's foot: the count alone at the trailing edge, no chevrons. `current` is null for a
 *  greeting whose text was edited away from every alternate. The visible `n / m` is a glyph run a screen
 *  reader reads as "n slash m", so it is hidden from the tree and named in words beside it. */
export function SwipeCount({ current, total, foot }: { readonly current: number | null; readonly total: number; readonly foot: SwipeFoot }): ReactElement {
  return (
    <Row align="center" justify="end" data-slot="swipe-count" className={foot.row}>
      <Text as="span" voice="datum" aria-hidden="true" data-slot="swipe-strip-counter" className={SWIPE_COUNTER}>
        {current ?? "—"} / {total}
      </Text>
      <Text as="span" className="sr-only">
        {variantCountName(current, total)}
      </Text>
    </Row>
  );
}
