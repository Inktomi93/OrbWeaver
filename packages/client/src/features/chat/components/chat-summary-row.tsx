// The shared chat-summary list row — the portrait / title / participants / relative-time shell rendered by
// BOTH the chats-list surface (with a kebab menu) and the landing "Recent chats" strip. The display-field
// derivation is the ONE `chatSummaryRowView` (lib/chat-summary-row.ts), so the two surfaces can't drift
// (derive-modernization §W5).
//
// F7 (visual-blech audit): the row renders the STATE its summary already carries instead of five identical
// shapes — a real participant portrait when the caller resolves one (`portraitHash`, D44: through the
// `Avatar` primitive, never a raw <img>), a starred marker, and a receded + labelled archived row. The
// markers follow the a11y-datum rule: the star is an `Icon` with an accessible `label` and the archived
// state is a TEXT badge — no state is carried by color/opacity alone.
import { blobUrl } from "@orb/contracts/assets";
import type { ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Icon, Star, Swords } from "@orb/ui/icons";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement, ReactNode } from "react";
import { RowToggleAction } from "#components";
import { cn, timeLib } from "#lib";
import { chatSummaryRowView } from "../lib/chat-summary-row";

type ChatSummaryItem = Parameters<typeof chatSummaryRowView>[0];

interface ChatSummaryRowProps {
  readonly chat: ChatSummaryItem;
  readonly onSelect: (chatId: ChatId) => void;
  readonly selected?: boolean;
  /** The CAS hash of the row's resolved participant portrait (`chatPortraitHash`); null/omitted falls back
   *  to the hue-seeded initials blob. Resolved by the SURFACE, which owns the character-list read. */
  readonly portraitHash?: string | null;
  /** Extra trailing controls (the chats-list kebab menu), rendered after the relative-time stamp. */
  readonly menu?: ReactNode;
  /** Supplied by a LIST PANE (which owns the star mutation) — the star stops being a passive marker and
   *  becomes the §12 state TOGGLE: one element, marker + affordance, `aria-pressed` carrying the datum.
   *  Omitted (the landing "Recent chats" strip, which has no row-action grammar) keeps the passive `Icon`. */
  readonly onToggleStar?: ((next: boolean) => void) | undefined;
  /** Row root className (the chats-list `group` hover-reveal root). */
  readonly className?: string;
}

/** The row's STAR: the §12 state toggle on a list pane (a caller that owns the mutation), else the passive
 *  labelled marker (the landing strip, which has no row-action grammar) — or nothing when unstarred. */
function starMarker({
  pressed,
  title,
  onToggleStar,
}: {
  readonly pressed: boolean;
  readonly title: string;
  readonly onToggleStar: ((next: boolean) => void) | undefined;
}): ReactNode {
  if (onToggleStar === undefined) {
    return pressed ? <Icon className="text-warning" icon={Star} label="Starred" size="sm" /> : null;
  }
  return (
    <RowToggleAction
      icon={Star}
      labelOff={`Star ${title}`}
      labelOn={`Unstar ${title}`}
      onToggle={(): void => onToggleStar(!pressed)}
      pressed={pressed}
      pressedClassName="text-warning"
    />
  );
}

/** One chat-summary row: portrait/initials avatar · title · participants subtitle · relative-time stamp ·
 *  star + archived markers, plus an optional trailing `menu`. The clickable body calls `onSelect(chat.id)`. */
export function ChatSummaryRow({ chat, onSelect, selected = false, portraitHash, menu, onToggleStar, className }: ChatSummaryRowProps): ReactElement {
  const { title, subtitle, when } = chatSummaryRowView(chat);
  // exactOptionalPropertyTypes: omit `src` entirely when there's no portrait so Avatar takes its fallback.
  const avatarSrc = portraitHash === undefined || portraitHash === null ? {} : { src: blobUrl(portraitHash) };
  const hasTrailing = chat.isGame || chat.star || chat.archived || menu !== undefined || onToggleStar !== undefined;
  const starSlot = starMarker({ pressed: chat.star, title, onToggleStar });
  return (
    <ListRow
      // The relative-time stamp now rides the ListRow `meta` slot — inside the row's accessible content
      // (part of aria-describedby), not stranded in the `actions` sibling outside the accessible name.
      meta={timeLib.formatRelative(when)}
      {...(hasTrailing
        ? {
            actions: (
              <>
                {/* The GAME marker (rpg-design/05 §2.1 — `metadata.rpg` presence): the quiet twin of the star,
                    labelled so the datum is TEXT for a screen reader, muted so it reads as a mark, not an action. */}
                {chat.isGame ? <Icon className="text-muted-foreground" icon={Swords} label="Game chat" size="sm" /> : null}
                {/* §12.2: on a LIST PANE the star IS the pressable — never a passive glyph doubled by a
                    control. Without a toggle handler (the landing strip) it stays the labelled marker. */}
                {starSlot}
                {chat.archived ? (
                  <Badge intent="neutral" size="sm" tone="soft">
                    Archived
                  </Badge>
                ) : null}
                {menu}
              </>
            ),
          }
        : {})}
      clickable={true}
      leading={
        <Avatar fallbackDelay={0} hueSeed={chat.id} size="sm" {...avatarSrc}>
          {initialsFor(title)}
        </Avatar>
      }
      onClick={(): void => onSelect(chat.id)}
      selected={selected}
      subtitle={subtitle}
      title={title}
      // An archived chat recedes so the live rows read first — the "Archived" badge above is the datum,
      // this is only its reinforcement.
      className={cn(className, chat.archived && "opacity-60") ?? ""}
    />
  );
}
