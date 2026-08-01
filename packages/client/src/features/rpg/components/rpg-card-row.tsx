// RpgCardRow — the ONE archived-card LIST row, shared by the card projection's two homes (the Scene "Cards"
// archive and the Journal chronicle/Cards scope; panel-redesign DESIGN.md §6 "chrome designed once, used in
// three homes"). The row IS the immersive card's title BAR minus its body — the same anatomy the transcript
// card wears when collapsed (✦ title · provenance · turn ref · open affordance), so a card reads the same
// wherever it is met. Bordered and compact (an instrument row, never a padded card-in-a-card).

import { Button } from "@orb/ui/button";
import { Expand, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ArchivedCard } from "../lib/archived-cards";
import { cardLabel } from "../lib/archived-cards";
import { RpgTurnRef } from "./rpg-turn-ref";

export interface RpgCardRowProps {
  readonly card: ArchivedCard;
  /** Opens the card in the archive lightbox (`RpgCardLightbox`) — addressed by `card.key`. */
  readonly onOpen: (key: string) => void;
}

/** One archived card as a row: the ✦ chrome voice + title, the `auto` provenance marker for a §4.8 lenient
 *  wrap, the origin turn ref, and the expand glyph that names the row's one action. */
export function RpgCardRow({ card, onOpen }: RpgCardRowProps): ReactElement {
  const label = cardLabel(card.title);
  return (
    <Button
      type="button"
      intent="ghost"
      size="inline"
      aria-label={`Open card: ${label}`}
      title="Open card"
      onClick={(): void => onOpen(card.key)}
      className="w-full border border-border px-field py-row text-left"
      data-slot="rpg-card-row"
    >
      <Text as="span" voice="label" className="min-w-0 flex-1 truncate">
        ✦ {label}
      </Text>
      {card.origin === "lenient" ? (
        <Text as="span" voice="gloss" className="shrink-0" title="Auto-rendered from raw HTML in the message">
          auto
        </Text>
      ) : null}
      <RpgTurnRef messageId={card.messageId} />
      <Icon icon={Expand} size="xs" className="shrink-0 text-muted-foreground" />
    </Button>
  );
}
