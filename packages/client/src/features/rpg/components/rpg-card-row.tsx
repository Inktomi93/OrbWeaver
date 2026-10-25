// RpgCardRow — the ONE archived-card LIST row, shared by the card projection's two homes (the Scene "Cards"
// archive and the Journal chronicle/Cards scope; "chrome designed once, used in
// three homes"). The row IS the immersive card's title BAR minus its body — the same anatomy the transcript
// card wears when collapsed (✦ title · provenance · turn ref · open affordance), so a card reads the same
// wherever it is met. Bordered and compact (an instrument row, never a padded card-in-a-card). The button is
// the `sm` control size, whose height is the pointer-conditional token (44px at a coarse pointer).

import { Button } from "@orb/ui/button";
import { Expand, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ArchivedCard } from "../lib/archived-cards.ts";
import { cardLabel } from "../lib/archived-cards.ts";
import { turnStamp } from "../lib/turn-stamp.ts";
import { RpgTurnRef } from "./rpg-turn-ref.tsx";

const LENIENT_NOTE = "auto-rendered from raw HTML in the message";

export interface RpgCardRowProps {
  readonly card: ArchivedCard;
  /** Opens the card in the archive lightbox (`RpgCardLightbox`) — addressed by `card.key`. */
  readonly onOpen: (key: string) => void;
}

/** One archived card as a row: the ✦ chrome voice + title, the visible `auto-rendered` provenance marker for a
 *  lenient wrap (also in the name, because the name replaces the row's text), the origin turn ref, and the
 *  expand glyph that names the row's one action. */
export function RpgCardRow({ card, onOpen }: RpgCardRowProps): ReactElement {
  const label = cardLabel(card.title);
  return (
    <Button
      type="button"
      intent="outline"
      size="sm"
      aria-label={`Open card: ${label}, ${turnStamp(card.createdAt)}${card.origin === "lenient" ? `, ${LENIENT_NOTE}` : ""}`}
      onClick={(): void => onOpen(card.key)}
      className="px-field text-start inline-full"
      data-slot="rpg-card-row"
    >
      <Text as="span" voice="label" className="flex-1 truncate min-inline-0">
        ✦ {label}
      </Text>
      {card.origin === "lenient" ? (
        <Text as="span" voice="gloss" className="shrink-0">
          auto-rendered
        </Text>
      ) : null}
      <RpgTurnRef messageId={card.messageId} createdAt={card.createdAt} />
      <Icon icon={Expand} size="xs" tone="muted" className="shrink-0" />
    </Button>
  );
}
