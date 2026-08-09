// The P4 CARD ARCHIVE (parity-plus §4.7) — the Scene tab's "Cards" section: every immersive card in the
// visible transcript, newest first, as a title list that opens the full sandboxed card in a lightbox dialog.
// Extracted from rpg-scene-tab.tsx (the tab outgrew the component-size cap). The transcript keeps the inline
// render; this is the "find that letter again" record surface. Absent entirely when the game's immersiveHtml
// option is off (applicability, not a disabled twin). Cross-domain read rides `trpc.chat.listMessages`
// DIRECTLY (lockdown §12 — the transcript surface shares this exact cache key, so this is a cache read).

import type { ChatId } from "@orb/kit/ids";
import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { ImmersiveCard } from "@orb/ui/immersive-card";
import { Stack } from "@orb/ui/layout";
import { useSandboxTheme } from "@orb/ui/sandbox-frame";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useCardFrameSrc, useTRPC } from "#data";
import type { ArchivedCard } from "../lib/archived-cards.ts";
import { cardLabel, collectArchivedCards } from "../lib/archived-cards.ts";
import { RpgCardRow } from "./rpg-card-row.tsx";
import { RpgDoorwayLine } from "./rpg-doorway-line.tsx";
import { Kicker } from "./rpg-kicker.tsx";

/** The archived-card LIGHTBOX — the one sandboxed-card dialog (this file is the gate-sanctioned Dialog
 *  home for the card-viewer species; Journal's day-group archive reuses it rather than minting a second
 *  raw-Dialog site). `openKey` addresses the card; `null` ⇒ closed. */
export function RpgCardLightbox({
  cards,
  openKey,
  onOpenChange,
  chatId,
}: {
  readonly cards: readonly ArchivedCard[];
  readonly openKey: string | null;
  readonly onOpenChange: (key: string | null) => void;
  /** The room the archive belongs to — the card-frame doorway selector. Absent (a story mount) ⇒ the
   *  srcdoc floor, which is the transcript's own fallback delivery and never a laxer one. */
  readonly chatId?: ChatId | undefined;
}): ReactElement {
  const openCard = cards.find((c) => c.key === openKey);
  return (
    <Dialog open={openCard !== undefined} onOpenChange={(open: boolean): void => onOpenChange(open ? openKey : null)}>
      <DialogPopup size="lg" className="gap-row">
        <DialogTitle>{cardLabel(openCard?.title ?? null)}</DialogTitle>
        {openCard === undefined ? null : <ArchivedCardBody card={openCard} chatId={chatId} />}
      </DialogPopup>
    </Dialog>
  );
}

/** The lightbox's card body. A COMPONENT because the routed card-frame handle is minted with a hook — and
 *  the card carries the ORIGIN ROW's render policy on BOTH axes: the archive is a second lens on the same
 *  authored content, so its sandbox CSP must be the transcript's, never a laxer default. */
function ArchivedCardBody({ card, chatId }: { readonly card: ArchivedCard; readonly chatId: ChatId | undefined }): ReactElement {
  const { themeTokens, fontFamily } = useSandboxTheme();
  const frameSrc = useCardFrameSrc(
    chatId === undefined ? undefined : { chatId, characterId: card.characterId, html: card.html, css: undefined, themeTokens, fontFamily },
  );
  return (
    <ImmersiveCard
      html={card.html}
      {...(card.title === null ? {} : { title: card.title })}
      origin={card.origin}
      allowExternalMedia={card.allowExternalMedia}
      {...(frameSrc === undefined ? {} : { frameSrc })}
    />
  );
}

export interface RpgSceneCardsProps {
  readonly chatId: ChatId;
  readonly enabled: boolean;
}

/** The card-archive section (parity-plus P4). Renders nothing when the game's immersiveHtml option is OFF
 *  (applicability, never a disabled twin); with cards ON but none written yet it renders the honest empty
 *  doorway — the section is silent-when-empty ONLY for a game that can't have cards at all (RV-2: an
 *  invisible section reads as an absent feature, and the Journal "Cards" scope already words this state). */
export function RpgSceneCards({ chatId, enabled }: RpgSceneCardsProps): ReactElement | null {
  const trpc = useTRPC();
  const messagesQuery = useQuery({ ...trpc.chat.listMessages.queryOptions({ chatId }), enabled });
  // The roster + viewer the per-card render policy resolves against — the SAME cache-first `chat.getChat`
  // read the takeover already holds (lockdown §12 direct read), never a second projection of it.
  const chatQuery = useQuery({ ...trpc.chat.getChat.queryOptions({ chatId }), enabled });
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!enabled) {
    return null;
  }
  // Newest first — Scene is the birth home; Journal archives the same cards into their day groups.
  const cards = [
    ...collectArchivedCards(messagesQuery.data?.messages ?? [], {
      participants: chatQuery.data?.participants,
      viewerUserId: chatQuery.data?.viewerUserId ?? null,
    }),
  ].reverse();
  if (cards.length === 0) {
    return (
      <Stack gap="field" data-slot="rpg-card-archive">
        <Kicker>Cards</Kicker>
        <RpgDoorwayLine>No cards yet — the story crafts them, and they land here.</RpgDoorwayLine>
      </Stack>
    );
  }
  return (
    <Stack gap="field" data-slot="rpg-card-archive">
      <Kicker>Cards — {cards.length}</Kicker>
      {cards.map((card) => (
        <RpgCardRow key={card.key} card={card} onOpen={setOpenKey} />
      ))}
      <RpgCardLightbox cards={cards} openKey={openKey} onOpenChange={setOpenKey} chatId={chatId} />
    </Stack>
  );
}
