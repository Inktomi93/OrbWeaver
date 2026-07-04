// `useVariantHistory` — a per-message, per-mount memory of the `idx -> variantId` pairs the swipe
// strip has actually OBSERVED through its own `MessageView` prop. The wire has no verb that enumerates
// a slot's SIBLING variant ids — `listMessages`/`getChat` return only the SELECTED variant per slot
// (D26: `MessageView` is the slot ⋈ its selected variant, never the full `message_variants` set). So a
// step-BACK to an idx this tab has never actually shown (e.g. a cold page load sitting mid-way through a
// slot with 3 variants) is NOT resolvable client-side — MISSING-API (a `listMessageVariants`-shaped read
// would remove the limit; flagged, not hacked around here). Within a single mount, though, every idx the
// user has actually SEEN (the initial selection + every subsequent swipe/selectVariant) is remembered, so
// back-and-forth navigation across a live session works without any extra wire surface.

import type { MessageView } from "@orb/contracts/chat";
import type { MessageId, MessageVariantId } from "@orb/kit/ids";
import { useEffect, useRef, useState } from "react";

export interface VariantHistory {
  /** The sibling variant id at `idx`, if this mount has observed it — `undefined` otherwise. */
  readonly get: (idx: number) => MessageVariantId | undefined;
}

/** Tracks the `idx -> variantId` pairs seen for ONE message slot across the swipe strip's lifetime;
 *  resets when `message.id` changes (a different slot has an unrelated variant history). */
export function useVariantHistory(message: MessageView): VariantHistory {
  // The lazy initializer captures the FIRST render's pair synchronously (before any paint), so the
  // currently-shown idx is always known immediately — no one-frame gap where even the current variant
  // looks "unseen".
  const [seen, setSeen] = useState<ReadonlyMap<number, MessageVariantId>>(
    () => new Map([[message.selectedVariantIdx, message.selectedVariantId]]),
  );
  const trackedMessageId = useRef<MessageId>(message.id);

  useEffect(() => {
    if (trackedMessageId.current !== message.id) {
      trackedMessageId.current = message.id;
      setSeen(new Map([[message.selectedVariantIdx, message.selectedVariantId]]));
      return;
    }
    setSeen((prev) => {
      if (prev.get(message.selectedVariantIdx) === message.selectedVariantId) {
        return prev; // already recorded — skip the no-op Map clone
      }
      return new Map(prev).set(message.selectedVariantIdx, message.selectedVariantId);
    });
  }, [message.id, message.selectedVariantIdx, message.selectedVariantId]);

  return { get: (idx) => seen.get(idx) };
}
