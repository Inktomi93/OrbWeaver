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
import { AvatarStack } from "@orb/ui/avatar-stack";
import { Badge } from "@orb/ui/badge";
import { Icon, Star, Swords } from "@orb/ui/icons";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement, ReactNode } from "react";
import { RowToggleAction } from "#components";
import { cn, timeLib } from "#lib";
import type { ChatRowPortrait } from "../lib/chat-summary-row";
import { chatRowActionName, chatSummaryRowView } from "../lib/chat-summary-row";

type ChatSummaryItem = Parameters<typeof chatSummaryRowView>[0];

interface ChatSummaryRowProps {
  readonly chat: ChatSummaryItem;
  readonly onSelect: (chatId: ChatId) => void;
  readonly selected?: boolean;
  /** The row's resolved character SEATS (`chatPortraits`), in seat order — one paints a portrait, two or
   *  more paint an `AvatarStack` (D3: a shared room must read SHARED at rest). Empty/omitted falls back to
   *  the hue-seeded initials blob. Resolved by the SURFACE, which owns the character-list read. */
  readonly portraits?: readonly ChatRowPortrait[];
  /** Extra trailing controls (the chats-list kebab menu), rendered after the relative-time stamp. */
  readonly menu?: ReactNode;
  /** Supplied by a LIST PANE (which owns the star mutation) — the star stops being a passive marker and
   *  becomes the §12 state TOGGLE: one element, marker + affordance, `aria-pressed` carrying the datum.
   *  Omitted (the landing "Recent chats" strip, which has no row-action grammar) keeps the passive `Icon`. */
  readonly onToggleStar?: ((next: boolean) => void) | undefined;
  /** Row root className (the chats-list `group` hover-reveal root). */
  readonly className?: string;
}

/** The number of leading slots a multi-seat room spends: 3 real faces + the "+N" chip (D3/§3.6). */
const STACK_SLOTS = 4;

/** The row's LEADING slot. One seat (or none) = a single portrait / the hue-seeded initials blob; two or
 *  more = an `AvatarStack`, so a group room reads SHARED at rest instead of borrowing one member's face
 *  and looking like a 1:1 with them (D3). Both surfaces inherit this — one row anatomy, no fork. */
function RowLeading({
  chatId,
  portraits,
  title,
}: {
  readonly chatId: string;
  readonly portraits: readonly ChatRowPortrait[];
  readonly title: string;
}): ReactElement {
  if (portraits.length >= 2) {
    return (
      <AvatarStack
        items={portraits.map((seat) => ({ name: seat.name, ...(seat.hash === null ? {} : { src: blobUrl(seat.hash) }) }))}
        max={STACK_SLOTS}
        size="sm"
      />
    );
  }
  // A single seat's portrait, or nothing resolved at all (a departed/foreign seat, a portrait-less
  // character, a character list that hasn't landed) — the initials blob is the honest fallback.
  const hash = portraits[0]?.hash ?? null;
  // exactOptionalPropertyTypes: omit `src` entirely when there's no portrait so Avatar takes its fallback.
  const avatarSrc = hash === null ? {} : { src: blobUrl(hash) };
  return (
    <Avatar fallbackDelay={0} hueSeed={chatId} size="sm" {...avatarSrc}>
      {initialsFor(title)}
    </Avatar>
  );
}

/** The row's STAR: the §12 state toggle on a list pane (a caller that owns the mutation), else the passive
 *  labelled marker (the landing strip, which has no row-action grammar) — or nothing when unstarred. */
function starMarker({
  pressed,
  rowName,
  onToggleStar,
}: {
  readonly pressed: boolean;
  /** The row's DISAMBIGUATED name (title + stamp) — the action labels' subject (`chatRowActionName`). */
  readonly rowName: string;
  readonly onToggleStar: ((next: boolean) => void) | undefined;
}): ReactNode {
  if (onToggleStar === undefined) {
    return pressed ? <Icon className="text-warning" icon={Star} label="Starred" size="sm" /> : null;
  }
  return (
    <RowToggleAction
      icon={Star}
      labelOff={`Star ${rowName}`}
      labelOn={`Unstar ${rowName}`}
      onToggle={(): void => onToggleStar(!pressed)}
      pressed={pressed}
      pressedClassName="text-warning"
    />
  );
}

/** One chat-summary row: portrait/initials avatar · title · participants subtitle · relative-time stamp ·
 *  star + archived markers, plus an optional trailing `menu`. The clickable body calls `onSelect(chat.id)`. */
export function ChatSummaryRow({ chat, onSelect, selected = false, portraits = [], menu, onToggleStar, className }: ChatSummaryRowProps): ReactElement {
  const { title, subtitle, when } = chatSummaryRowView(chat);
  const hasTrailing = chat.isGame || chat.star || chat.archived || menu !== undefined || onToggleStar !== undefined;
  // A rest-VISIBLE marker earns its width in flow; a cluster that is entirely hover-revealed must not
  // reserve ~76px the title/subtitle need in a 307px pane (side-eye P1-2b) — it floats at the row's end.
  const restVisible = chat.isGame || chat.star || chat.archived;
  const starSlot = starMarker({ pressed: chat.star, rowName: chatRowActionName(title, timeLib.formatRelativeCompact(when)), onToggleStar });
  return (
    <ListRow
      // The relative-time stamp rides the ListRow `meta` slot — inside the row's accessible content (part of
      // aria-describedby), not stranded in the `actions` sibling outside the accessible name. STAMP form
      // (`2h`/`3w`, not "2 hours ago"): in a list this is a column the eye scans, and the long form ate ~7
      // characters of the title's width on every row (side-eye P1-2a).
      actionsFloat={!restVisible}
      meta={timeLib.formatRelativeCompact(when)}
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
      leading={<RowLeading chatId={chat.id} portraits={portraits} title={title} />}
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
