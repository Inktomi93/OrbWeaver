// The swipe strip: flanking chevrons + the n / m variant counter, shown on the last assistant message
// only. Right chevron: at the tip fires swipe (a fresh generation); stepped back, it fires
// selectVariant (a pointer move, no new generation), same as the left chevron. Both resolve their
// target variant id through useVariantHistory, since MessageView carries only the selected variant per
// slot.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' re-export of the lucide-react glyphs (external .d.ts); tsc resolves the barrel (same class as react's Suspense in query-boundary.tsx).
import { ChevronLeft, ChevronRight, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useCallback } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { useSwipeKeyboardNav } from "../hooks/use-swipe-keyboard-nav";
import { useVariantHistory } from "../hooks/use-variant-history";

interface SwipeVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}

interface SelectVariantVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
}

const useSwipeMutation = createEntityMutation<SwipeVars, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't generate that swipe.",
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
  const canStepForward = nextVariantId !== undefined;

  const goPrev = useCallback((): void => {
    if (busy || prevVariantId === undefined) {
      return;
    }
    selectVariant.mutate({ chatId, messageId, variantId: prevVariantId });
  }, [busy, prevVariantId, selectVariant, chatId, messageId]);

  const goNext = useCallback((): void => {
    if (busy) {
      return;
    }
    if (canStepForward && nextVariantId !== undefined) {
      selectVariant.mutate({ chatId, messageId, variantId: nextVariantId });
      return;
    }
    swipe.mutate({ chatId, messageId });
  }, [busy, canStepForward, nextVariantId, selectVariant, swipe, chatId, messageId]);

  useSwipeKeyboardNav({ onPrev: goPrev, onNext: goNext });

  return (
    <Row gap="field" align="center" data-slot="swipe-strip">
      <Button
        intent="ghost"
        size="icon"
        disabled={!canStepBack}
        loading={busy && canStepBack}
        aria-label="Previous variant"
        onClick={goPrev}
      >
        <Icon icon={ChevronLeft} size="sm" />
      </Button>
      <Text as="span" size="label" tone="muted">
        {current} / {total}
      </Text>
      <Button intent="ghost" size="icon" loading={busy} aria-label="Next variant" onClick={goNext}>
        <Icon icon={ChevronRight} size="sm" />
      </Button>
    </Row>
  );
}
