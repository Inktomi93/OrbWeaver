// The swipe strip: flanking chevrons + the n / m variant counter, shown on the last assistant message
// only. Right chevron: at the tip fires swipe (a fresh generation); stepped back, it fires
// selectVariant (a pointer move, no new generation), same as the left chevron. Both resolve their
// target variant id through useVariantHistory, since MessageView carries only the selected variant per
// slot.
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
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { cn, turnMutationToast } from "#lib";
import { useSwipeKeyboardNav } from "../hooks/use-swipe-keyboard-nav.ts";
import { useVariantHistory } from "../hooks/use-variant-history.ts";

interface SwipeVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}

interface SelectVariantVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
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
  /** #221 — the wallpaper legibility backing the ROW owns (`BG_PHOTO_CHROME_PLATE`), threaded rather
   *  than imported here so the one home for the row's backings stays `message-row-backing.ts` and this
   *  component keeps knowing nothing about the shell's wallpaper flag (the `MessageMetadataRow`
   *  precedent). Without it the chevrons floated on the raw photo at 1.60:1 — WCAG 1.4.11 needs 3:1 for
   *  a UI component, and this band is the one chrome row under the bubble that took no chip. */
  readonly backingClass?: string | undefined;
}

export function SwipeStrip({ message, backingClass }: SwipeStripProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const swipe = useSwipeMutation({ trpc, invalidation });
  const selectVariant = useSelectVariantMutation({ trpc, invalidation });
  const history = useVariantHistory(message);

  const { chatId, id: messageId, selectedVariantIdx: idx } = message;
  const total = Math.max(message.variantCount, 1);
  const current = idx + 1;
  const busy = swipe.isPending || selectVariant.isPending;

  const prevVariantId = current > 1 ? history.get(idx - 1) : undefined;
  const nextVariantId = current < total ? history.get(idx + 1) : undefined;
  const canStepBack = prevVariantId !== undefined;

  const goPrev = (): void => {
    if (busy || prevVariantId === undefined) {
      return;
    }
    selectVariant.mutate({ chatId, messageId, variantId: prevVariantId });
  };

  const goNext = (): void => {
    if (busy) {
      return;
    }
    if (nextVariantId !== undefined) {
      selectVariant.mutate({ chatId, messageId, variantId: nextVariantId });
      return;
    }
    swipe.mutate({ chatId, messageId });
  };

  useSwipeKeyboardNav({ onPrev: goPrev, onNext: goNext });

  // A PAGER NEEDS PAGES (side-eye leg-4 P3). With one variant the strip rendered "1 / 1" flanked by a
  // disabled ‹ and a › — a counter that counts to one and an arrow that cannot move, which reads as a
  // broken control rather than as "there is nothing to page through". The one thing that IS live here is
  // the right chevron, which at the tip GENERATES rather than steps; so at a single variant the strip is
  // just that verb. The counter and the back-step return the moment a second variant exists.
  //
  // ⚑ SUPERSEDES A PIN, NOT ITS MECHANISM: `swipe-strip.ct.tsx` asserted "the left chevron is DISABLED
  // when variantCount === 1". Its real subject — `useVariantHistory`'s gate never firing a query at one
  // variant — is untouched and still pinned; what changed is that the disabled affordance no longer
  // renders at all, which is the affordance-lie the review filed.
  const showPager = total > 1;

  // #570 RULED (owner, 2026-08-23): KEEP BOTH — this chevron and the ✨ menu's Regenerate row (
  // composer-utility-menu.tsx) ratify as cross-plane under #568's own logic (reader-side pager vs.
  // composer control), with distinct honest names. What #568's triage left unsettled was the NAME at
  // variantCount === 1: this lone chevron GENERATES (not steps) here, so it must say so rather than
  // borrow the pager's "Next variant" label.
  const nextChevronLabel = showPager ? "Next variant" : "Generate a variant";

  return (
    // THE PLATE SIZES TO ITS CONTENT (#228). #221 gave this band the row's wallpaper backing and fixed its
    // contrast (1.60:1 → 8.78:1), but the band is a block-level flex row, so the plate spanned the full
    // message width: a measured 686x50 chip holding one 34x34 button — **3.4% ink coverage**, in the same
    // fill and the same radius as a message bubble. It read as a bubble that failed to load. The mechanism
    // is unchanged (same `backingClass`, same contrast); `w-fit` is the geometry half — a compact chip
    // around the chevron cluster, which is what the plate was always backing.
    //
    // TRAILING-EDGE ALIGNED (#312). This chip is a direct child of the content column (a `flex-col`
    // `Stack`), so by omission it sat at the cross-START — the left edge — while every other row action
    // (edit/fork/kebab in the name row) packs to the TRAILING edge. `self-end` places the chevron cluster
    // under the actions it belongs with, at the column's right edge, in every skin (the swipe strip is an
    // assistant-only affordance and the name row's actions are `justify-between`/trailing for the assistant
    // side, so the two clusters share one right edge). `w-fit` keeps the plate hugging the chevrons.
    <Row gap="field" align="center" data-slot="swipe-strip" className={cn("w-fit self-end", backingClass)}>
      {showPager ? (
        <Button intent="ghost" size="icon" disabled={!canStepBack} loading={busy && canStepBack} aria-label="Previous variant" onClick={goPrev}>
          <Icon icon={ChevronLeft} size="sm" />
        </Button>
      ) : null}
      {/* The counter is a VALUE you read — the `datum` voice, whose tabular mono figures stop the count
          from nudging the chevrons sideways as it ticks (density-pass-spec.md §2.3).
          IT IS NAMED FOR THE EYE NOW (#490). `‹ 8 / 8 ›` under a transcript is the universal pagination
          shape, and it was read as one BY THE REVIEWER, with the source open — "8 / 8" says there are seven
          earlier pages of conversation. The a11y tree was already correct ("Previous variant" / "Next
          variant"), which made this the sharper kind of defect: the screen-reader user was told what the
          control is and the sighted user was not. The fix is the VISIBLE word, in the existing micro voice,
          never a mechanism change — the counter itself keeps its `datum` tabular figures beside it. */}
      {showPager ? (
        <>
          <Text as="span" voice="kicker">
            Variant
          </Text>
          <Text as="span" voice="datum">
            {current} / {total}
          </Text>
        </>
      ) : null}
      <Button intent="ghost" size="icon" loading={busy} aria-label={nextChevronLabel} onClick={goNext}>
        <Icon icon={ChevronRight} size="sm" />
      </Button>
    </Row>
  );
}
