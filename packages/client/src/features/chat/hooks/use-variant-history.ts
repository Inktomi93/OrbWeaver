// `useVariantHistory` — the swipe strip's step-target resolver: `idx -> variantId` for one message slot.
// FIXED (was per-mount-observed-only, MISSING-API — see the git history / scratch note for the prior
// shape): the wire now has `chat.listMessageVariants` (domain/chat/verbs/read.ts createListMessageVariants),
// the full sibling-variant set for a slot (D26 — `{variantId, idx}[]`, no content), so a step to an idx this
// tab has never rendered (e.g. a cold page load sitting mid-way through a multi-variant slot) resolves
// correctly instead of only what this mount happened to observe live.
//
// GATED (`useGatedQuery`/skipToken, §13.1 — the hard rule for a conditional fetch): the list is fetched ONLY
// when the slot actually HAS siblings (`variantCount > 1`) — a single-variant slot has nothing to step to,
// so the query never fires for the common case. The CURRENT selection is always known synchronously (folded
// into the returned map even before the fetch resolves / while gated off), so the presently-shown idx never
// reads as "unseen" for a one-frame gap.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { useMemo } from "react";
import { useGatedQuery, useTRPC } from "#data";

export interface VariantHistory {
  /** The sibling variant id at `idx`, or `undefined` if the real list hasn't resolved it (still loading, or
   *  a genuinely out-of-range idx). */
  readonly get: (idx: number) => MessageVariantId | undefined;
}

/** The gate key — present only when the slot has more than one variant (a step target could exist). */
interface GateKey {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}

/** Resolves the full `idx -> variantId` map for ONE message slot, gated on `variantCount > 1`. */
export function useVariantHistory(message: MessageView): VariantHistory {
  const trpc = useTRPC();
  const { chatId, id: messageId, variantCount, selectedVariantIdx, selectedVariantId } = message;

  const gateKey: GateKey | undefined = variantCount > 1 ? { chatId, messageId } : undefined;
  const query = useGatedQuery(gateKey, ({ chatId: gChatId, messageId: gMessageId }: GateKey) =>
    trpc.chat.listMessageVariants.queryOptions({ chatId: gChatId, messageId: gMessageId }),
  );

  return useMemo<VariantHistory>(() => {
    const byIdx = new Map<number, MessageVariantId>((query.data ?? []).map((v) => [v.idx, v.variantId] as const));
    // The current selection is always known immediately (the `MessageView` prop itself), even before the
    // fetch resolves or while gated off — no one-frame gap where the shown idx looks "unseen".
    if (!byIdx.has(selectedVariantIdx)) {
      byIdx.set(selectedVariantIdx, selectedVariantId);
    }
    return { get: (idx): MessageVariantId | undefined => byIdx.get(idx) };
  }, [query.data, selectedVariantIdx, selectedVariantId]);
}
