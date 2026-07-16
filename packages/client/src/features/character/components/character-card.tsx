// CharacterCardTile — the library list row. One shape, both flat + categorized modes: a face-sized
// avatar, the name, the distilled-pitch subtitle ladder (elevatorPitch → tag line → handle), a star
// chip, and a dual-purpose Chat CTA (resume-or-new). In bulk mode the row's click toggles a selection
// checkbox instead of opening the editor.
//
// Named `*Tile` because @orb/contracts owns `CharacterCard` as the ST wire-card type.

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeOverride } from "@orb/contracts/theme";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Archive, Copy, Icon, MessagesSquare, Star } from "@orb/ui/icons";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { ROW_REVEAL, RowActionsMenu } from "#components";

export interface CharacterCardItem {
  readonly id: string;
  readonly name: string;
  /** Identity slug — the subtitle ladder's last fallback. */
  readonly handle: string;
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
  /** The accepted canonical tags (pending suggestions already excluded upstream). */
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
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

  const bulkActions = <Checkbox aria-label={`Select ${character.name}`} checked={bulkSelected} onCheckedChange={(): void => onToggleBulk(character.id)} />;

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
          />
        )
      }
      className="group"
      clickable={true}
      leading={
        <Avatar hueSeed={character.id} shape="square" size="lg" {...avatarSrc}>
          {initialsFor(character.name)}
        </Avatar>
      }
      onClick={(): void => (bulkMode ? onToggleBulk(character.id) : onSelect(character.id))}
      selected={bulkMode ? bulkSelected : selected}
      subtitle={subtitle}
      title={character.name}
      // Not in bulk mode (the row is a checkbox target, no hover disclosure).
      {...(bulkMode ? {} : { subtitleReveal: `${character.handle} · ${character.tokenSize}` })}
    />
  );
}

/** The normal-mode trailing actions: the always-visible Star + dual-purpose Chat CTA (§4.4/§9c —
 *  the 1-click core loop, hover-revealed on fine pointers, always-on for coarse) + the ⋯ overflow. */
function NormalRowActions({
  character,
  onChat,
  onToggleStar,
  onToggleArchive,
  onDuplicate,
  onDelete,
}: {
  readonly character: CharacterCardItem;
  readonly onChat: (id: string) => void;
  readonly onToggleStar: (id: string, next: boolean) => void;
  readonly onToggleArchive: (id: string, next: boolean) => void;
  readonly onDuplicate: (id: string) => void;
  readonly onDelete: (id: string) => void;
}): ReactElement {
  return (
    <>
      {character.archived ? (
        <Badge intent="warning" size="sm">
          Archived
        </Badge>
      ) : null}
      <Button
        aria-label={character.starred ? `Unstar ${character.name}` : `Star ${character.name}`}
        {...(character.starred ? { className: "text-warning" } : {})}
        intent="ghost"
        onClick={(): void => onToggleStar(character.id, !character.starred)}
        size="icon"
        type="button"
      >
        <Icon icon={Star} size="sm" />
      </Button>
      <Button
        aria-label={`Chat with ${character.name}`}
        className={ROW_REVEAL}
        intent="ghost"
        onClick={(): void => onChat(character.id)}
        size="icon"
        type="button"
      >
        <Icon icon={MessagesSquare} size="sm" />
      </Button>
      <RowActionsMenu
        align="start"
        label={`Actions for ${character.name}`}
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
      </RowActionsMenu>
    </>
  );
}
