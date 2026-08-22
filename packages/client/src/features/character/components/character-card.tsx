// CharacterCardTile — the library list row. One shape, both flat + categorized modes: a face-sized
// avatar, the name, the distilled-pitch subtitle ladder (elevatorPitch → tag line → handle), a star
// chip, and a dual-purpose Chat CTA (resume-or-new). In bulk mode the row's click toggles a selection
// checkbox instead of opening the editor.
//
// Named `*Tile` because @orb/contracts owns `CharacterCard` as the ST wire-card type.
//
// THE TRAILING ZONE IS SPLIT (side-eye 2026-08-18 P1-3, the chats-row precedent): rest-visible MARKERS
// (★ / Archived) ride `ListRow.markers` on the title line, and the trailing cluster holds only the
// hover-revealed controls — so `actionsFloat` is on outside bulk mode and the NAME keeps the row's full
// width at rest instead of yielding 114px of a 290px row to a cluster that paints nothing.

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeOverride } from "@orb/contracts/theme";
import type { CharacterHandle } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { slugifyHandle } from "@orb/kit/slug";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Archive, Copy, Download, Icon, MessagesSquare, Star } from "@orb/ui/icons";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem, MenuLinkItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { ROW_REVEAL, ROW_REVEAL_SWAP, RowActionsMenu, RowToggleAction } from "#components";
import { rowActionSubject } from "#lib";

/** The owner-gated card download route (`GET /api/export/character/:characterId`) — export's ONE home is
 *  this row's kebab (import is the list band's ghost; the editor carries no lifecycle chrome).
 *
 *  BOTH containers the route serves are items in ONE submenu, the chat kebab's grammar
 *  (`chat/components/chat-list-row-menu.tsx`): absent `?format` ⇒ `png`, the ST-parity card with the avatar
 *  welded in; `?format=json` is the unwrapped V3 TavernCard the import door already accepts, so the round
 *  trip is closed. The server arm shipped without an affordance — this is the affordance, not a new door. */
const EXPORT_CHARACTER_PATH = "/api/export/character/";

export interface CharacterCardItem {
  readonly id: string;
  readonly name: string;
  /** Identity slug — the subtitle ladder's last fallback. */
  readonly handle: CharacterHandle;
  readonly archived: boolean;
  readonly starred: boolean;
  /** CAS key — null when no avatar; never `avatarAssetId` (blob route keyed by hash). */
  readonly avatarHash: string | null;
  /** The discovery-domain distilled one-liner — the subtitle's first choice. `null` until distilled. */
  readonly elevatorPitch: string | null;
  /** Per-character theme override; `null` inherits the global accent. */
  readonly themeOverride: ThemeOverride | null;
  /** Advisory card-heft estimate — the hover/:focus-within raw-metadata reveal (handle · tokenSize). */
  readonly tokenSize: number;
  /** The accepted canonical tags (pending suggestions already excluded upstream). `folderType` rides along
   *  because the SAME rows feed the categorized view's grouping, where it decides a group's first paint
   *  (C9-1d, `character-list-view.ts`'s `RowTag`) — the row itself never reads it. */
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard" | "folderType">[];
}

export interface CharacterCardTileProps {
  readonly character: CharacterCardItem;
  readonly selected: boolean;
  /** Bulk mode: the click toggles selection (not open-editor) and a checkbox replaces the actions. */
  readonly bulkMode: boolean;
  readonly bulkSelected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onToggleBulk: (id: string) => void;
  /** The dual-purpose Chat CTA — the surface passes a handler that resumes the most-recent chat or
   *  starts a new one; the row is agnostic to which. */
  readonly onChat: (id: string) => void;
  readonly onToggleStar: (id: string, next: boolean) => void;
  readonly onToggleArchive: (id: string, next: boolean) => void;
  readonly onDuplicate: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

/**
 * THE ROW'S ANNOUNCED IDENTITY (#492, side-eye 2026-08-22 rail-characters P1-2) — `undefined` when the name
 * says it all, the HANDLE when it does not.
 *
 * The library holds genuine same-name collisions (three `Emily` at handles `emily`/`emily-2`/`emily-3`;
 * `Hikari`×2 and `Eva`×2 inside the first 50 rows), and the row announced its `name` alone: three identical
 * `button "Emily"`. Voice control could address none of them ("click emily-3" matches nothing) and
 * list-navigation / low-verbosity screen-reader modes, which drop descriptions, heard one name three times.
 *
 * IT GATES ON DERIVABILITY, NOT ON COLLISION, and that is a deviation from the #443/#458/#463 qualifier
 * resolvers with two receipts. (1) Those resolve a qualifier ACROSS THE LIST, and this list is keyset-paged
 * 30 at a time: a collision scan over the loaded page would answer about the page, not the library, and the
 * name would CHANGE under a screen-reader user as later pages arrived — the same lie `#493` is fixing in the
 * group counts. (2) The review assumed the handle is the row's visible subtitle; it is the ladder's LAST
 * rung (`elevatorPitch ?? tagLine ?? handle`, below), so any character with a distilled pitch or a visible
 * tag — every orphan import, whose `orphan import` TAG takes the rung — never shows one. A per-row,
 * paging-stable rule is the only one that holds. The handle is unique per owner, so it always separates
 * them; when it is merely the name slugified it says nothing, and is spent on nothing.
 */
function handleQualifier(character: Pick<CharacterCardItem, "name" | "handle">): string | undefined {
  return character.handle === slugifyHandle(character.name) ? undefined : character.handle;
}

export function CharacterCardTile({
  character,
  selected,
  bulkMode,
  bulkSelected,
  onSelect,
  onToggleBulk,
  onChat,
  onToggleStar,
  onToggleArchive,
  onDuplicate,
  onDelete,
}: CharacterCardTileProps): ReactElement {
  const visibleTags = character.tags.filter((tag) => !tag.isHiddenOnCard);
  const tagLine = visibleTags.length === 0 ? null : visibleTags.map((tag) => tag.name).join(" · ");
  // Fallback ladder: the distilled pitch → the tag line → the handle. Always a line (never blank).
  const subtitle = character.elevatorPitch ?? tagLine ?? character.handle;
  // exactOptionalPropertyTypes: omit `src` entirely for a missing avatar so it falls to the fallback.
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
  // ONE announced identity for the row AND every control that acts on it (`rowActionSubject`, #443/#458/#463):
  // "Star Emily" / "Chat with Emily" / "Actions for Emily" collided across the three Emilys exactly as the row
  // body did, so fixing only the body would have left three identically-named kebabs behind it.
  const qualifier = handleQualifier(character);
  const subject = rowActionSubject(character.name, qualifier);

  const bulkActions = <Checkbox aria-label={`Select ${subject}`} checked={bulkSelected} onCheckedChange={(): void => onToggleBulk(character.id)} />;
  const markers = bulkMode ? undefined : rowMarkers(character);

  return (
    <ListRow
      // The Chat CTA is the row's 1-click core loop (§9c) — it stays a visible target (hover-revealed
      // on fine pointers, always-on for coarse), never folded into the kebab. Bulk mode is a checkbox.
      actions={
        bulkMode ? (
          bulkActions
        ) : (
          <NormalRowActions
            character={character}
            onChat={onChat}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onToggleArchive={onToggleArchive}
            onToggleStar={onToggleStar}
            subject={subject}
          />
        )
      }
      // THE NAME GETS ITS WIDTH BACK (side-eye 2026-08-18 P1-3). The cluster is three hover-revealed
      // controls, and reserving their strip in flow spent 114px of a 290px row on nothing you can see at
      // rest while the TITLE — the one thing a 327-character library is scanned by, with 27 duplicate-name
      // groups in it — got the same 114px and clipped on 3 of 18 loaded rows. `actionsFloat` lifts the
      // cluster out of flow at the row's inline end (fine pointers only), so the text column keeps the full
      // width at rest AND the reveal costs no reflow — the truncation point does not jump under the pointer.
      // The app already proved the space exists: select mode's title box is 210px on the same pane.
      //
      // The float arm is INERT at rest, so a rest-VISIBLE control must not ride it: bulk mode's checkbox is
      // exactly that, and it keeps the reserved strip (`rowTint="row"`, or the tint stops before the
      // sibling cluster). The star's pressed state moved to `markers` on the title line, where it is in the
      // accessible tree and in flow — the same split the chats row landed (chat-summary-row.tsx).
      actionsFloat={!bulkMode}
      rowTint={bulkMode ? "row" : "body"}
      {...(markers === undefined ? {} : { markers })}
      className="group"
      clickable={true}
      // `md` (32px) is THE list-row portrait size — the mock's one row rhythm, shared with the chats panes
      // (side-eye P2-5). The library's 40px pitched its rows ~12px taller than the chats list of the same
      // entities. 40px survives where it means HIERARCHY: the projection's identity HEADER.
      leading={
        <Avatar hueSeed={character.id} shape="square" size="md" {...avatarSrc}>
          {initialsFor(character.name)}
        </Avatar>
      }
      onClick={(): void => (bulkMode ? onToggleBulk(character.id) : onSelect(character.id))}
      selected={bulkMode ? bulkSelected : selected}
      subtitle={subtitle}
      title={character.name}
      {...(qualifier === undefined ? {} : { titleQualifier: qualifier })}
      // Not in bulk mode (the row is a checkbox target, no hover disclosure).
      {...(bulkMode ? {} : { subtitleReveal: `${character.handle} · ${character.tokenSize}` })}
    />
  );
}

/** The row's TITLE-LINE markers — the state the row already carries, rest-visible, INSIDE the text column
 *  (`ListRow.markers`, which rides `aria-describedby`, unlike the `aria-hidden` leading slot).
 *
 *  This is the half that makes `actionsFloat` legal on this row (P1-3): a floated cluster is inert and sits
 *  ON the title text, so anything the row shows AT REST has to earn its width where the text already is. The
 *  ★ here and the star TOGGLE in the cluster are ONE concept, so the marker rides `ROW_REVEAL_SWAP` — it
 *  paints the pressed state at rest and steps aside exactly when the control that sets it reveals, so the
 *  row never paints two stars. `undefined` when the row is in neither state: the slot is data-driven, never
 *  an empty reserved box. */
function rowMarkers(character: Pick<CharacterCardItem, "archived" | "starred">): ReactNode {
  if (!(character.archived || character.starred)) {
    return;
  }
  return (
    <>
      {character.starred ? <Icon className={`text-warning ${ROW_REVEAL_SWAP}`} icon={Star} label="Starred" size="sm" /> : null}
      {character.archived ? (
        <Badge intent="warning" size="sm">
          Archived
        </Badge>
      ) : null}
    </>
  );
}

/** The normal-mode trailing actions — CONTROLS ONLY (the rest-visible markers moved to the title line, so
 *  the whole cluster is hover-revealed and can float): the Star state-toggle at `rest="never"` (its pressed
 *  face is the title-line ★), the dual-purpose Chat CTA (§4.4/§9c — the 1-click core loop, hover-revealed on
 *  fine pointers, always-on for coarse) + the ⋯ overflow. */
function NormalRowActions({
  character,
  subject,
  onChat,
  onToggleStar,
  onToggleArchive,
  onDuplicate,
  onDelete,
}: {
  readonly character: CharacterCardItem;
  /** The row's announced identity (`rowActionSubject(name, handleQualifier)`) — what every control here
   *  embeds, so a library holding three "Emily"s cannot ship three identically-named kebabs (#492). The
   *  ROW BODY spells the same pair without the action grammar's quotes (`ListRow.titleQualifier` →
   *  `Emily · emily-3`): one identity, two sentence shapes — a name standing alone, and a name inside a verb. */
  readonly subject: string;
  readonly onChat: (id: string) => void;
  readonly onToggleStar: (id: string, next: boolean) => void;
  readonly onToggleArchive: (id: string, next: boolean) => void;
  readonly onDuplicate: (id: string) => void;
  readonly onDelete: (id: string) => void;
}): ReactElement {
  return (
    <>
      {/* D11, in its MARKER form (`rest="never"`): the toggle is always reveal-gated because the title-line
          ★ (`rowMarkers`) is what carries the pressed state at rest — D11's invariant is met in the marker
          slot, and the two never paint together (`ROW_REVEAL_SWAP`). That is what leaves this cluster
          entirely hover-revealed, which is the precondition for `actionsFloat` returning the name its
          114px (P1-3). Same split as the chats row. */}
      <RowToggleAction
        icon={Star}
        labelOff={`Star ${subject}`}
        labelOn={`Unstar ${subject}`}
        onToggle={(): void => onToggleStar(character.id, !character.starred)}
        pressed={character.starred}
        pressedClassName="text-warning"
        rest="never"
      />
      <Button aria-label={`Chat with ${subject}`} className={ROW_REVEAL} intent="ghost" onClick={(): void => onChat(character.id)} size="icon" type="button">
        <Icon icon={MessagesSquare} size="sm" />
      </Button>
      <RowActionsMenu
        align="start"
        label={`Actions for ${subject}`}
        reveal={true}
        destructive={{
          separator: false,
          title: `Delete "${character.name}"?`,
          description: "This permanently deletes the character and everything attached to it. This can't be undone.",
          onConfirm: (): void => onDelete(character.id),
        }}
      >
        <MenuItem onClick={(): void => onToggleArchive(character.id, !character.archived)}>
          <Icon icon={Archive} size="sm" />
          {character.archived ? "Unarchive" : "Archive"}
        </MenuItem>
        <MenuItem onClick={(): void => onDuplicate(character.id)}>
          <Icon icon={Copy} size="sm" />
          Duplicate
        </MenuItem>
        <MenuSubmenuRoot>
          <MenuSubmenuTrigger>
            <Icon icon={Download} size="sm" />
            Export card
          </MenuSubmenuTrigger>
          <MenuPopup>
            {/* The route's DEFAULT arm — no `?format`, the ST-parity card with this row's avatar welded in. */}
            <MenuLinkItem download={true} href={`${EXPORT_CHARACTER_PATH}${character.id}`}>
              With avatar (.png)
            </MenuLinkItem>
            <MenuLinkItem download={true} href={`${EXPORT_CHARACTER_PATH}${character.id}?format=json`}>
              Data only (.json)
            </MenuLinkItem>
          </MenuPopup>
        </MenuSubmenuRoot>
      </RowActionsMenu>
    </>
  );
}
