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
//
// The row's trailing zone is SPLIT (side-eye P1, round 2): rest-visible MARKERS ride `ListRow.markers` on
// the title line (where the mock draws them), and the trailing cluster holds only the hover-revealed
// controls — so `actionsFloat` is unconditionally on and the text column keeps the row's full width at rest.
// Gating the float on "no marker is showing" was inert on a real chats list, where nearly every row is a
// game / starred / archived one.
import { blobUrl } from "@orb/contracts/assets";
import type { ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { AvatarStack } from "@orb/ui/avatar-stack";
import { Badge } from "@orb/ui/badge";
import { Icon, Star, Swords } from "@orb/ui/icons";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement, ReactNode } from "react";
import { ROW_REVEAL_SWAP, RowToggleAction } from "#components";
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
  /** Supplied by a LIST PANE (which owns the star mutation) — the row grows the §12 state TOGGLE in its
   *  revealed cluster, and the title-line ★ becomes that toggle's rest-visible face (they swap, never
   *  co-exist). Omitted (the landing "Recent chats" strip, which has no row-action grammar) leaves the ★ a
   *  plain always-visible marker. */
  readonly onToggleStar?: ((next: boolean) => void) | undefined;
  /** The subject this row's ACTIONS name ("Star …") — supplied by the list pane, which resolves it across
   *  the whole list so same-named rows can't share one accessible name (`rowQualifiers`). Falls back to the
   *  row's own title + shown stamp for a caller with no list context. */
  readonly actionName?: string;
  /** Row root className (the chats-list `group` hover-reveal root). */
  readonly className?: string;
}

/** The number of leading slots a multi-seat room spends: 3 real faces + the "+N" chip (D3/§3.6). */
const STACK_SLOTS = 4;

/** The row's LEADING slot. One seat (or none) = a single portrait / the hue-seeded initials blob; two or
 *  more = an `AvatarStack`, so a group room reads SHARED at rest instead of borrowing one member's face
 *  and looking like a 1:1 with them (D3). Both surfaces inherit this — one row anatomy, no fork.
 *
 *  `md` (32px) is THE list-row portrait size across every LIST pane — the mock's single row rhythm
 *  (`.row .av{width:32px}`). The chats panes ran 24px and the character library 40px, so the two dense
 *  instrument lists scanned at different pitches (side-eye P2-5). */
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
        size="md"
      />
    );
  }
  // A single seat's portrait, or nothing resolved at all (a departed/foreign seat, a portrait-less
  // character, a character list that hasn't landed) — the initials blob is the honest fallback.
  const hash = portraits[0]?.hash ?? null;
  // exactOptionalPropertyTypes: omit `src` entirely when there's no portrait so Avatar takes its fallback.
  const avatarSrc = hash === null ? {} : { src: blobUrl(hash) };
  return (
    <Avatar fallbackDelay={0} hueSeed={chatId} size="md" {...avatarSrc}>
      {initialsFor(title)}
    </Avatar>
  );
}

/** The row's TITLE-LINE markers (the mock's ⚔ / ★ / Archived cluster): the state the row already carries,
 *  rest-visible, inside the text column. `undefined` when the row is in none of those states — the slot is
 *  data-driven, never an empty reserved box.
 *
 *  The ★ here and the star TOGGLE in the floated cluster are ONE concept, so on a list pane (a caller that
 *  owns the mutation) the marker rides `ROW_REVEAL_SWAP`: it paints the pressed state at rest and steps
 *  aside exactly when the control that sets it reveals. The landing strip has no row-action grammar, so
 *  there its ★ is unconditional. */
function rowMarkers({
  chat,
  interactive,
}: {
  readonly chat: Pick<ChatSummaryItem, "isGame" | "star" | "archived">;
  /** The caller owns the star mutation ⇒ a revealed toggle exists to swap against. */
  readonly interactive: boolean;
}): ReactNode {
  const marked = chat.isGame || chat.star || chat.archived;
  if (!marked) {
    return;
  }
  return (
    <>
      {/* The GAME marker (rpg-design/05 §2.1 — `metadata.rpg` presence): the quiet twin of the star,
          labelled so the datum is TEXT for a screen reader, muted so it reads as a mark, not an action. */}
      {chat.isGame ? <Icon className="text-muted-foreground" icon={Swords} label="Game chat" size="sm" /> : null}
      {chat.star ? <Icon className={cn("text-warning", interactive && ROW_REVEAL_SWAP) ?? ""} icon={Star} label="Starred" size="sm" /> : null}
      {chat.archived ? (
        <Badge intent="neutral" size="sm" tone="soft">
          Archived
        </Badge>
      ) : null}
    </>
  );
}

/** One chat-summary row: portrait/initials avatar · title · participants subtitle · relative-time stamp ·
 *  star + archived markers, plus an optional trailing `menu`. The clickable body calls `onSelect(chat.id)`. */
export function ChatSummaryRow({
  chat,
  onSelect,
  selected = false,
  portraits = [],
  menu,
  onToggleStar,
  actionName,
  className,
}: ChatSummaryRowProps): ReactElement {
  const { title, subtitle, when } = chatSummaryRowView(chat);
  const rowName = actionName ?? chatRowActionName(title, timeLib.formatRelativeCompact(when));
  const markers = rowMarkers({ chat, interactive: onToggleStar !== undefined });
  // The trailing cluster is now CONTROLS ONLY (the markers moved to the title line), so every one of its
  // members is hover-revealed and the float is unconditional — the text column keeps the row's full width at
  // rest on every chat row, not just the state-less ones (side-eye P1, round 2: the round-1 gate was inert
  // on 100% of rows, because `isGame || star || archived` is exactly the state a chats list is full of).
  const hasControls = menu !== undefined || onToggleStar !== undefined;
  return (
    <ListRow
      // The relative-time stamp rides the ListRow `meta` slot — inside the row's accessible content (part of
      // aria-describedby), not stranded in the `actions` sibling outside the accessible name. STAMP form
      // (`2h`/`3w`, not "2 hours ago"): in a list this is a column the eye scans, and the long form ate ~7
      // characters of the title's width on every row (side-eye P1-2a).
      actionsFloat={true}
      meta={timeLib.formatRelativeCompact(when)}
      {...(markers === undefined ? {} : { markers })}
      {...(hasControls
        ? {
            actions: (
              <>
                {/* §12.2: on a LIST PANE the star IS the pressable — never a passive glyph doubled by a
                    control. It is always reveal-gated (`rest="never"`) because the title-line ★ marker is
                    what carries the pressed state at rest, and the two must never paint together. */}
                {onToggleStar === undefined ? null : (
                  <RowToggleAction
                    icon={Star}
                    labelOff={`Star ${rowName}`}
                    labelOn={`Unstar ${rowName}`}
                    onToggle={(): void => onToggleStar(!chat.star)}
                    pressed={chat.star}
                    pressedClassName="text-warning"
                    rest="never"
                  />
                )}
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
