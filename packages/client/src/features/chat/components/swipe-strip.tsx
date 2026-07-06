// The swipe strip (task #17 built the minimal generate-only shape; task #19 completes it). Flanking
// chevrons + the `n / m` variant counter, shown by the surface on the LAST assistant message only
// (message-row.tsx's `showSwipes` gate — hidden mid-stream/edit; read-only from here, not this lane's
// file). Both mutations run through `createEntityMutation` — the ONE mutation factory (§13.2), never an
// inline useMutation; the resulting `variantSelected`/`messageCommitted` bus events invalidate
// listMessages so the counter + shown content update with no manual cache patch (`selectVariant` is
// bus-driven — this file never writes the query cache directly).
//
// RIGHT chevron: `current === total` (at the tip) fires `swipe` (append a fresh generation, unchanged
// from #17). `current < total` (the user stepped BACK earlier and is now moving forward through
// already-generated siblings) instead fires `selectVariant` — a pointer move, no new generation — same
// as the left chevron. LEFT chevron: `selectVariant` to the EARLIER sibling (#19 — was disabled in #17
// pending the verb; `chat.selectVariant` is now wired on the transport).
//
// Both directions resolve their TARGET variant id through `useVariantHistory` (hooks/use-variant-
// history.ts) — `MessageView` carries only the SELECTED variant per slot (D26), so the hook fetches the
// real sibling list (`chat.listMessageVariants`, gated on `variantCount > 1`) and resolves ANY idx from it,
// including one this mount has never rendered (a cold page load mid-way through a multi-variant slot). A
// chevron stays disabled only while the real answer is unknown (still loading) or genuinely out of range —
// never a dead click to an unresolvable id.
//
// Keyboard: Arrow-Left/Right drive the same two handlers via `useSwipeKeyboardNav` (hooks/use-swipe-
// keyboard-nav.ts) — see that hook's header for the composer-focus gating note.

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

// Module-scope factories → the returned hooks have a stable identity (the §13.1 pattern). Bus events do
// the cache work; `invalidates` is the settle-time backstop routed through the central seam. TData is
// `unknown` — both results are bus-driven, not consumed here.
const useSwipeMutation = createEntityMutation<SwipeVars, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listMessages.pathFilter(),
    trpc.chat.listMessageVariants.pathFilter(),
  ],
  errorToast: "Couldn't generate that swipe.",
});

const useSelectVariantMutation = createEntityMutation<SelectVariantVars, unknown>({
  options: (trpc) => trpc.chat.selectVariant.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listMessages.pathFilter(),
    trpc.chat.listMessageVariants.pathFilter(),
  ],
  errorToast: "Couldn't switch to that variant.",
});

export interface SwipeStripProps {
  readonly message: MessageView;
}

/** The `n / m` swipe counter + prev/next variant navigation for the tail assistant message. */
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
  // Not at the tip: the next idx is an EXISTING sibling — a step, never a fresh generation.
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
