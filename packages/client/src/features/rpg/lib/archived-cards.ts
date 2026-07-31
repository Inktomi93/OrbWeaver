// The ONE transcript→card projection (parity-plus §4.7; panel-redesign §6 P4 — "chrome designed once,
// used in three homes"): tokenize the visible transcript's SELECTED-variant bodies and collect the
// immersive-card spans. Shared by the Scene "Cards" archive (newest-first title list) and the Journal
// chronicle (cards archived into the day they were born — the §4 "Journal" rule), so both lenses read the
// SAME projection of the same cache entry (`trpc.chat.listMessages` — lockdown §12 direct read).

import type { CardSpanOrigin } from "@orb/kit/content";
import { tokenizeContent } from "@orb/kit/content";

/** One archived card projected from the visible transcript, stamped with its birth time (`createdAt` —
 *  the origin MESSAGE's wall time; Journal's day-grouping key). */
export interface ArchivedCard {
  readonly key: string;
  /** The origin message — the row's TurnRef anchor (§12.1.4 "only where the data really carries a ref"). */
  readonly messageId: string;
  readonly title: string | null;
  readonly html: string;
  readonly origin: CardSpanOrigin;
  readonly createdAt: number;
}

const CARD_LABEL = "Immersive card";

/** Collect the card spans from the transcript's messages, TRANSCRIPT ORDER (oldest first — callers own
 *  their sort). The lenient arm is ON to match the game reading surface. */
export function collectArchivedCards(
  messages: readonly { readonly id: string; readonly content: string; readonly createdAt: number }[],
): readonly ArchivedCard[] {
  const cards: ArchivedCard[] = [];
  for (const message of messages) {
    tokenizeContent(message.content, { lenientHtml: true }).forEach((span, index) => {
      if (span.kind === "card") {
        cards.push({
          key: `${message.id}-${index}`,
          messageId: message.id,
          title: span.title,
          html: span.body,
          origin: span.origin,
          createdAt: message.createdAt,
        });
      }
    });
  }
  return cards;
}

/** The label a card renders under — its title, or the untitled fallback. */
export function cardLabel(title: string | null): string {
  return title !== null && title !== "" ? title : CARD_LABEL;
}
