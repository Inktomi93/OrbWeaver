// The swipe strip: flanking chevrons + the n / m variant counter, shown on the last assistant message
// only. It renders as a TRACK (an inline-size container, full column width, no paint) wrapping the CHIP
// (`data-slot="swipe-strip"`, the w-fit plate everything else measures) — #598's geometry seal: the chip may
// not size the column its bubble lives in, and the track's own width is what the kicker's stand-down reads. Right chevron: at the tip fires swipe (a fresh generation); stepped back, it fires
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
import { ChevronLeft, ChevronRight, Icon, RefreshCw } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { cn, turnMutationToast } from "#lib";
import { useSwipeKeyboardNav } from "../hooks/use-swipe-keyboard-nav.ts";
import { useVariantHistory } from "../hooks/use-variant-history.ts";
import { VARIANT_GENERATE_NAME, VARIANT_NEXT_NAME, VARIANT_PREV_NAME } from "../lib/message-action-names.ts";
import { PAGER_CHIP, PAGER_CHIP_COMPACT, PAGER_COUNTER, PAGER_LABEL_QUIET_WHEN_TIGHT, PAGER_TRACK } from "../lib/pager-chrome.ts";

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
  const nextChevronLabel = showPager ? VARIANT_NEXT_NAME : VARIANT_GENERATE_NAME;

  return (
    // THE PAGER MAY NOT SIZE THE BUBBLE'S COLUMN (#598). The content column is a flex child of a row body
    // that SHRINK-WRAPS (the bubble family's outer carries `items-start`), so the column resolves to the
    // max-content of its widest child — and since #490 grew this chip from ~123px to 177.5px, the widest
    // child of a SHORT reply's column was the PAGER, not the bubble. Measured on the row story before this
    // change: bubble 132.00 · strip 177.55 · column 177.55, i.e. a chip hanging 45px past the right edge of
    // the box it pages (the #312 pin's own header recorded the same collapse at the two-word default body
    // and worked around it by lengthening its fixture; this is that finding's fix).
    //
    // `container-type: inline-size` (Tailwind's `@container`) is the mechanism, and it does BOTH halves at
    // once: an inline-size container's width is resolved WITHOUT regard to its contents, so this track
    // contributes nothing to the column's max-content (the column now sizes to the bubble) while the track
    // itself still stretches to whatever the column resolved to. The chip inside is then measured against the
    // BUBBLE's width instead of dictating it — which is what #608 had to answer next: `lib/pager-chrome.ts`
    // owns the geometry vocabulary both strips share, and its header states the two rules in full.
    <Stack data-slot="swipe-strip-track" className={PAGER_TRACK}>
      {/* THE PLATE SIZES TO ITS CONTENT (#228). #221 gave this band the row's wallpaper backing and fixed its
          contrast (1.60:1 → 8.78:1), but the band is a block-level flex row, so the plate spanned the full
          message width: a measured 686x50 chip holding one 34x34 button — **3.4% ink coverage**, in the same
          fill and the same radius as a message bubble. It read as a bubble that failed to load. The mechanism
          is unchanged (same `backingClass`, same contrast); `w-fit` is the geometry half — a compact chip
          around the chevron cluster, which is what the plate was always backing.

          TRAILING-EDGE ALIGNED (#312). This chip is a direct child of the content column (a `flex-col`
          `Stack`), so by omission it sat at the cross-START — the left edge — while every other row action
          (edit/fork/kebab in the name row) packs to the TRAILING edge. The chip is placed under the actions
          it belongs with, at the column's right edge, in every skin (the swipe strip is an assistant-only
          affordance and the name row's actions are `justify-between`/trailing for the assistant side, so the
          two clusters share one right edge). #312's PLACEMENT survives #598/#608 verbatim; its LEVER moved
          from `self-end` to the auto margin in `PAGER_CHIP`, which is the same trailing edge plus a defined
          overflow direction (read that constant — the difference is a chevron that stayed on screen).

          `w-fit` BECAME `w-max` (#608, `PAGER_CHIP`). Once the track contains the column, `w-fit` resolved
          the chip against the BUBBLE's width, and at a coarse pointer a short bubble made the chip's own
          flex children absorb the deficit: chevrons at 41.41×48 (under both the app's 48px coarse box and
          WCAG 2.5.5's 44px) with the counter wrapped to two lines. `w-max` says the plate is its content
          and nothing else — the contained track absorbs any overflow, and the column is unaffected either
          way, which is the whole point of rule 1. The chip still hugs (`max-content` IS the hug) — what it
          no longer does is shrink below the controls it backs. */}
      <Row gap="field" align="center" data-slot="swipe-strip" className={cn(PAGER_CHIP, PAGER_CHIP_COMPACT, backingClass)}>
        {showPager ? (
          <Button intent="ghost" size="icon" disabled={!canStepBack} loading={busy && canStepBack} aria-label={VARIANT_PREV_NAME} onClick={goPrev}>
            <Icon icon={ChevronLeft} size="sm" />
          </Button>
        ) : null}
        {/* The counter is a VALUE you read — the `datum` voice, whose tabular mono figures stop the count
            from nudging the chevrons sideways as it ticks (UI-Density-Law.md §2.3).
            IT IS NAMED FOR THE EYE NOW (#490). `‹ 8 / 8 ›` under a transcript is the universal pagination
            shape, and it was read as one BY THE REVIEWER, with the source open — "8 / 8" says there are seven
            earlier pages of conversation. The a11y tree was already correct ("Previous variant" / "Next
            variant"), which made this the sharper kind of defect: the screen-reader user was told what the
            control is and the sighted user was not. The fix is the VISIBLE word, in the existing micro voice,
            never a mechanism change — the counter itself keeps its `datum` tabular figures beside it.

            #490's RULING SURVIVES; ITS INPUT CHANGED (#598). The word is what makes the full chip 177.5px —
            wider than the bubble under a short reply, which is the defect above. Track containment stops the
            chip from WIDENING that bubble, but nothing can stop a 177.5px chip from OVERHANGING a 132px one,
            so the word stands down exactly where it cannot fit: the container query reads the track, whose
            width IS the bubble's, and below `PAGER_LABEL_QUIET_WHEN_TIGHT`'s threshold the chip falls back to
            its pre-#490 `‹ n / m ›` (99.48px compact at a fine pointer, 127.48px at a coarse one).

            THE STAND-DOWN IS VISUAL ONLY (#608). #598 spelled it `hidden`, which took #490's OTHER half with
            it — a `display: none` node is out of the a11y tree, so the screen-reader user stopped being told
            what the control is at exactly the widths where the sighted one already had. `sr-only` leaves the
            FLOW without leaving the tree (absolutely positioned ⇒ zero width contribution, and an abspos
            child is not a flex item, so its gap goes too): the band still reads "Variant 2 / 3", pinned by an
            ariaSnapshot at a narrow mount. #490's subject holds wherever the surface can hold it. */}
        {showPager ? (
          <>
            <Text as="span" voice="kicker" className={PAGER_LABEL_QUIET_WHEN_TIGHT}>
              Variant
            </Text>
            {/* …and in a tight chip it surrenders the two spaces around its slash (`PAGER_COUNTER`) — 15.6px
                that buy the chevrons their touch box back. The TEXT never changes; only its word-spacing. */}
            <Text as="span" voice="datum" data-slot="swipe-strip-counter" className={PAGER_COUNTER}>
              {current} / {total}
            </Text>
          </>
        ) : null}
        {/* THE SINGLE-VARIANT ARM IS A NAMED VERB, NOT A NAKED CHEVRON (#849). The pager arm above is
            unchanged; this is the OTHER arm, and shipped it was the only affordance in the app whose visible
            label is the empty string — a 34×34 transparent `›` floating over the room's background art
            between the plate and the composer, with an empty `textContent` AND an empty parent text. A
            right-pointing chevron universally means "next"; here it costs a model call.

            TWO CHANGES, BOTH MINIMAL. The GLYPH becomes `RefreshCw` — the house's regenerate mark, already
            carrying that meaning on the composer's ✨ Regenerate row 40px below (composer-utility-menu.tsx),
            so the "next page" reading is gone even before the word is read. And the word is VISIBLE:
            "Generate", in the `sm` control box rather than the icon square, so the control says what it does
            without hover.

            THE OLD RULING SURVIVES — ITS INPUT CHANGED. The header's "A PAGER NEEDS PAGES" ruling removed
            the `1 / 1` counter and the dead back-chevron at one variant, and that mechanism is untouched
            here: `showPager` still gates BOTH, and no counter comes back. What the ruling did not settle is
            that the surviving verb rendered as a pager glyph with no name.

            "Generate" IS A SUBSTRING OF THE ACCESSIBLE NAME, deliberately: #570 ruled the accname at one
            variant is "Generate a variant", and WCAG 2.5.3 requires the visible label to appear in it, so
            the visible word is the verb the accname already opens with rather than a synonym. */}
        {showPager ? (
          <Button intent="ghost" size="icon" loading={busy} aria-label={nextChevronLabel} onClick={goNext}>
            <Icon icon={ChevronRight} size="sm" />
          </Button>
        ) : (
          <Button intent="ghost" size="sm" loading={busy} aria-label={nextChevronLabel} onClick={goNext}>
            <Icon icon={RefreshCw} size="sm" />
            Generate
          </Button>
        )}
      </Row>
    </Stack>
  );
}
