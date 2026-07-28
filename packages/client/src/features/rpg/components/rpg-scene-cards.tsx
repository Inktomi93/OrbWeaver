// The P4 CARD ARCHIVE (parity-plus §4.7) — the Scene tab's "Cards" section: every immersive card in the
// visible transcript, newest first, as a title list that opens the full sandboxed card in a lightbox dialog.
// Extracted from rpg-scene-tab.tsx (the tab outgrew the component-size cap). The transcript keeps the inline
// render; this is the "find that letter again" record surface. Absent entirely when the game's immersiveHtml
// option is off (applicability, not a disabled twin). Cross-domain read rides `trpc.chat.listMessages`
// DIRECTLY (lockdown §12 — the transcript surface shares this exact cache key, so this is a cache read).

import type { CardSpanOrigin } from "@orb/kit/content";
import { tokenizeContent } from "@orb/kit/content";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { ImmersiveCard } from "@orb/ui/immersive-card";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useTRPC } from "#data";

const CARD_LABEL = "Immersive card";

/** One archived card projected from the visible transcript (parity-plus §4 — the P4 card archive). */
interface ArchivedCard {
  readonly key: string;
  readonly title: string | null;
  readonly html: string;
  readonly origin: CardSpanOrigin;
}

/** Tokenize the visible transcript's bodies and collect the card spans, newest first — the same
 *  selected-variant read the standing-lie inventory uses (lineage-consistent by construction). The lenient
 *  arm is ON here to match the game reading surface (this section only renders when `immersiveHtml` is). */
function collectArchivedCards(messages: readonly { readonly id: string; readonly content: string }[]): ArchivedCard[] {
  const cards: ArchivedCard[] = [];
  for (const message of messages) {
    tokenizeContent(message.content, { lenientHtml: true }).forEach((span, index) => {
      if (span.kind === "card") {
        cards.push({ key: `${message.id}-${index}`, title: span.title, html: span.body, origin: span.origin });
      }
    });
  }
  return cards.reverse();
}

/** The label a card renders under — its title, or the untitled fallback. */
function cardLabel(title: string | null): string {
  return title !== null && title !== "" ? title : CARD_LABEL;
}

export interface RpgSceneCardsProps {
  readonly chatId: ChatId;
  readonly enabled: boolean;
}

/** The card-archive section (parity-plus P4). Renders nothing when the game's immersiveHtml option is off or
 *  the transcript holds no cards (applicability, never a disabled twin). */
export function RpgSceneCards({ chatId, enabled }: RpgSceneCardsProps): ReactElement | null {
  const trpc = useTRPC();
  const messagesQuery = useQuery({ ...trpc.chat.listMessages.queryOptions({ chatId }), enabled });
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!enabled) {
    return null;
  }
  const cards = collectArchivedCards(messagesQuery.data?.messages ?? []);
  if (cards.length === 0) {
    return null;
  }
  const openCard = cards.find((c) => c.key === openKey);
  return (
    <Stack gap="field" data-slot="rpg-card-archive">
      <Text size="label" tone="muted" transform="caps" className="tracking-micro">
        Cards — {cards.length}
      </Text>
      {cards.map((card) => (
        <Button key={card.key} intent="ghost" size="sm" className="justify-start" onClick={(): void => setOpenKey(card.key)}>
          <Text size="label" className="truncate">
            ✦ {cardLabel(card.title)}
          </Text>
        </Button>
      ))}
      <Dialog open={openCard !== undefined} onOpenChange={(open: boolean): void => setOpenKey(open ? openKey : null)}>
        <DialogPopup size="lg" className="gap-row">
          <DialogTitle>{cardLabel(openCard?.title ?? null)}</DialogTitle>
          {openCard === undefined ? null : (
            <ImmersiveCard html={openCard.html} {...(openCard.title === null ? {} : { title: openCard.title })} origin={openCard.origin} />
          )}
        </DialogPopup>
      </Dialog>
    </Stack>
  );
}
