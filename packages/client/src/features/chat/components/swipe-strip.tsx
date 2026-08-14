// The swipe strip: flanking chevrons + the n / m variant counter, shown on the last assistant message
// only. Right chevron: at the tip fires swipe (a fresh generation); stepped back, it fires
// selectVariant (a pointer move, no new generation), same as the left chevron. Both resolve their
// target variant id through useVariantHistory, since MessageView carries only the selected variant per
// slot.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronLeft, ChevronRight, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { useSwipeKeyboardNav } from "../hooks/use-swipe-keyboard-nav.ts";
import { useVariantHistory } from "../hooks/use-variant-history.ts";
import { turnMutationToast } from "../lib/turn-abort-notice.ts";

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
}

export function SwipeStrip({ message }: SwipeStripProps): ReactElement {
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

  return (
    <Row gap="field" align="center" data-slot="swipe-strip">
      {showPager ? (
        <Button intent="ghost" size="icon" disabled={!canStepBack} loading={busy && canStepBack} aria-label="Previous variant" onClick={goPrev}>
          <Icon icon={ChevronLeft} size="sm" />
        </Button>
      ) : null}
      {/* The counter is a VALUE you read — the `datum` voice, whose tabular mono figures stop the count
          from nudging the chevrons sideways as it ticks (density-pass-spec.md §2.3). */}
      {showPager ? (
        <Text as="span" voice="datum">
          {current} / {total}
        </Text>
      ) : null}
      <Button intent="ghost" size="icon" loading={busy} aria-label="Next variant" onClick={goNext}>
        <Icon icon={ChevronRight} size="sm" />
      </Button>
    </Row>
  );
}
