// The swipe foot: ‹ `n / m` › grouped at the message's trailing corner, on the
// last assistant message only. Where it sits and how its chevrons meet the edge is the chat style's
// (`RowSkin.swipeFoot`, lib/pager-chrome.ts), drawn by `FootRow`. Right chevron: at the tip fires swipe (a fresh generation);
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
import { GlyphButton } from "@orb/ui/glyph-button";
import { ChevronLeft, ChevronRight, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useId } from "react";
import { useInvalidation, useTRPC } from "#data";
import { viewerTimeZone } from "#lib";
import { useSwipeMutation } from "../hooks/use-message-mutations.ts";
import { useSelectVariantMutation } from "../hooks/use-select-variant.ts";
import { useSwipeKeyboardNav } from "../hooks/use-swipe-keyboard-nav.ts";
import { useVariantHistory } from "../hooks/use-variant-history.ts";
import { VARIANT_GENERATE_NAME, VARIANT_NEXT_NAME, VARIANT_PREV_NAME, variantCountName } from "../lib/message-action-names.ts";
import type { SwipeFoot } from "../lib/pager-chrome.ts";

export interface SwipeStripProps {
  readonly message: MessageView;
  /** The chat style's swipe treatment. */
  readonly foot: SwipeFoot;
}

// An inside foot never sets its container's width: `contain: inline-size` takes it out of a shrink-to-fit bubble's
// intrinsic width, so a "Hi." bubble stays as narrow as its header and the foot stretches to fit.
const FOOT_INSIDE = "contain-inline-size";

/** The foot line's own box for the chat style's edge: its reach past the reading inset, and any fill or plate. */
function FootRow({
  edge,
  align,
  justify,
  gap,
  ...props
}: Omit<ComponentProps<"div">, "className"> & { readonly edge: SwipeFoot["edge"] } & Pick<
    ComponentProps<typeof Row>,
    "align" | "justify" | "gap"
  >): ReactElement {
  if (edge === "card") {
    return <Row {...props} align={align} justify={justify} gap={gap} ground="bubble" cardCorners="bottom" reach="foot" wrap={true} className={FOOT_INSIDE} />;
  }
  if (edge === "plate") {
    return <Row {...props} align={align} justify={justify} gap={gap} plate="card" wrap={true} paddingInline="field" />;
  }
  return <Row {...props} align={align} justify={justify} gap={gap} wrap={true} className={FOOT_INSIDE} />;
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
    <FootRow edge={props.foot.edge} align="center" justify="end" gap="tight" data-slot={props.slot} role="group" aria-label={props.label}>
      {props.prev}
      {props.count}
      {props.next}
    </FootRow>
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
  // ordinary idiom for a bounded pager; a generate button is not part of that cycle. A test that pins
  // both halves keeps the forward one specifically so "fix the other end for
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
          <GlyphButton
            variant="ghost"
            ink="muted"
            glyph="lg"
            shape="pill"
            disabled={!canStepBack}
            loading={busy && canStepBack}
            aria-label={VARIANT_PREV_NAME}
            onClick={goPrev}
          >
            <Icon icon={ChevronLeft} size="sm" />
          </GlyphButton>
        }
        count={
          // A VALUE you read — the `datum` voice, whose tabular figures stop the count nudging the chevron as
          // it ticks (UI-Density-Law.md §2.3). The position and nothing else: owner ruling, a label is noise.
          <Text as="span" voice="datum" aria-hidden="true" data-slot="swipe-strip-counter" whitespace="nowrap" ink="muted">
            {current} / {total}
          </Text>
        }
        next={
          <GlyphButton
            variant="ghost"
            ink="muted"
            glyph="lg"
            shape="pill"
            disabled={waitingForNext}
            loading={busy || waitingForNext}
            aria-label={nextChevronLabel}
            aria-describedby={waitingForNext ? historyStatusId : undefined}
            onClick={goNext}
          >
            <Icon icon={ChevronRight} size="sm" />
          </GlyphButton>
        }
      />
      {waitingForNext ? (
        <Text as="span" id={historyStatusId} voice="label" ink="muted" role="status">
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
    <FootRow edge={foot.edge} align="center" justify="end" data-slot="swipe-count">
      <Text as="span" voice="datum" aria-hidden="true" data-slot="swipe-strip-counter" whitespace="nowrap" ink="muted">
        {current ?? "—"} / {total}
      </Text>
      <Text as="span" className="sr-only">
        {variantCountName(current, total)}
      </Text>
    </FootRow>
  );
}
