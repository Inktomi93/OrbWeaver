// The CARD ARCHIVE — the Scene tab's "Cards" section: every immersive card in the
// visible transcript, newest first, as a title list that opens the full sandboxed card in a lightbox dialog.
// Extracted from rpg-scene-tab.tsx (the tab outgrew the component-size cap). The transcript keeps the inline
// render; this is the "find that letter again" record surface. Absent entirely when the game's immersiveHtml
// option is off (applicability, not a disabled twin). Cross-domain read rides `trpc.chat.listMessages`
// DIRECTLY (lockdown §12 — the transcript surface shares this exact cache key, so this is a cache read).

import type { ChatId } from "@orb/kit/ids";
import { ImmersiveCard } from "@orb/ui/immersive-card";
import { Stack } from "@orb/ui/layout";
import { useSandboxTheme } from "@orb/ui/sandbox-frame";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { QueryBoundary, ViewerDialog } from "#components";
import { QueryErrorState, SkeletonRows, useCardFrameSrc, useTRPC } from "#data";
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
    <ViewerDialog
      title={cardLabel(openCard?.title ?? null)}
      open={openCard !== undefined}
      onOpenChange={(open: boolean): void => onOpenChange(open ? openKey : null)}
    >
      {openCard === undefined ? null : <ArchivedCardBody card={openCard} chatId={chatId} />}
    </ViewerDialog>
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

/** Placeholder rows while the transcript lands — a height, never a population claim. */
const ARCHIVE_PENDING_ROWS = 2;

export interface RpgSceneCardsProps {
  readonly chatId: ChatId;
  readonly enabled: boolean;
}

/** The card-archive section (parity-plus P4). Renders nothing when the game's immersiveHtml option is OFF
 *  (applicability, never a disabled twin); with cards ON but none written yet it renders the honest empty
 *  doorway — the section is silent-when-empty ONLY for a game that can't have cards at all (RV-2: an
 *  invisible section reads as an absent feature, and the Journal "Cards" scope already words this state). */
export function RpgSceneCards({ chatId, enabled }: RpgSceneCardsProps): ReactElement | null {
  const headingId = useId();
  if (!enabled) {
    return null;
  }
  // The section root sits outside the boundary, so the error arm is the shared error state itself. The kicker
  // stays with each arm because the settled one carries the card count. RESERVED per chat: the resync doorway
  // below would otherwise jump when a later read lands, and the settled height is that chat's card count, so a
  // shared key would hand one room's box to another. `surface-box-store` never evicts, so each game chat this
  // device opens leaves one number behind; that is bounded by the rooms a person plays and costs bytes.
  return (
    // A region named by its kicker. The error arm renders no kicker, so `aria-label` is the name that arm falls
    // back to (an `aria-labelledby` that matches no element is skipped).
    <Stack aria-label="Cards" aria-labelledby={headingId} data-slot="rpg-card-archive" role="region">
      <QueryBoundary
        fallback={
          <Stack gap="field">
            <Kicker id={headingId}>Cards</Kicker>
            <SkeletonRows count={ARCHIVE_PENDING_ROWS} />
          </Stack>
        }
        renderError={(_error, retry): ReactElement => <QueryErrorState label="this game's cards" onRetry={retry} />}
        reserveKey={`rpg.cardArchive.${chatId}`}
      >
        <ArchiveBody chatId={chatId} headingId={headingId} />
      </QueryBoundary>
    </Stack>
  );
}

function ArchiveBody({ chatId, headingId }: Pick<RpgSceneCardsProps, "chatId"> & { readonly headingId: string }): ReactElement {
  const trpc = useTRPC();
  const [{ data: messages }, { data: chat }] = useSuspenseQueries({
    queries: [trpc.chat.listMessages.queryOptions({ chatId }), trpc.chat.getChat.queryOptions({ chatId })],
  });
  const [openKey, setOpenKey] = useState<string | null>(null);
  const cards = collectArchivedCards(messages.messages, { participants: chat.participants, viewerUserId: chat.viewerUserId }).toReversed();
  if (cards.length === 0) {
    return (
      <Stack gap="field">
        <Kicker id={headingId}>Cards</Kicker>
        <RpgDoorwayLine>No cards yet — the story crafts them, and they land here.</RpgDoorwayLine>
      </Stack>
    );
  }
  return (
    <Stack gap="field">
      <Kicker id={headingId}>Cards — {cards.length}</Kicker>
      {cards.map((card) => (
        <RpgCardRow key={card.key} card={card} onOpen={setOpenKey} />
      ))}
      <RpgCardLightbox cards={cards} openKey={openKey} onOpenChange={setOpenKey} chatId={chatId} />
    </Stack>
  );
}
