// The swipe strip (MINIMAL — task #17 scope; fuller variant UX = task #19). Flanking chevrons + the
// `n / m` variant counter, shown by the surface on the LAST assistant message only. The RIGHT chevron
// fires the `swipe` verb (append a fresh generation) through `createEntityMutation` — the ONE mutation
// factory (§13.2), never an inline useMutation; the resulting `variantSelected`/`messageCommitted` bus
// event invalidates listMessages so the counter + shown content update with no manual cache patch.
//
// MISSING-API (flagged for #19): stepping BACK to an already-generated variant needs the domain verb
// `selectVariant` (EXISTS: domain/chat/contract/service.ts) — but it is NOT exposed on the tRPC chat
// router (only `swipe` is). So the LEFT chevron is disabled here; wiring `chat.selectVariant` on the
// transport + the step-vs-generate branch is #19's job. The strip is deliberately generate-only for now.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' re-export of the lucide-react glyphs (external .d.ts); tsc resolves the barrel (same class as react's Suspense in query-boundary.tsx).
import { ChevronLeft, ChevronRight, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { createEntityMutation, useTRPC } from "#data";
import { useInvalidation } from "../hooks/use-invalidation";

interface SwipeVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}

// Module-scope factory → the returned hook has a stable identity (the §13.1 pattern). Bus events do
// the cache work; `invalidates` is the settle-time backstop routed through the central seam. TData is
// `unknown` — the swipe result is bus-driven, not consumed here.
const useSwipeMutation = createEntityMutation<SwipeVars, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listMessages.pathFilter(),
  ],
  errorToast: "Couldn't generate that swipe.",
});

export interface SwipeStripProps {
  readonly message: MessageView;
}

/** The `n / m` swipe counter + generate-next control for the tail assistant message. */
export function SwipeStrip({ message }: SwipeStripProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const swipe = useSwipeMutation({ trpc, invalidation });

  const total = Math.max(message.variantCount, 1);
  const current = message.selectedVariantIdx + 1;

  return (
    <Row gap="field" align="center" data-slot="swipe-strip">
      {/* Disabled until `chat.selectVariant` is on the transport (see header) — step-back is #19. */}
      <Button intent="ghost" size="icon" disabled={true} aria-label="Previous variant">
        <Icon icon={ChevronLeft} size="sm" />
      </Button>
      <Text as="span" size="label" tone="muted">
        {current} / {total}
      </Text>
      <Button
        intent="ghost"
        size="icon"
        loading={swipe.isPending}
        aria-label="Next variant"
        onClick={(): void => {
          swipe.mutate({ chatId: message.chatId, messageId: message.id });
        }}
      >
        <Icon icon={ChevronRight} size="sm" />
      </Button>
    </Row>
  );
}
