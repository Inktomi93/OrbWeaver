// CharacterCardTile — the §4.4 LIST row (the reworked row anatomy; character-list-row lives HERE, one
// home — the file keeps its `*Tile` name to avoid a rename churn across its story + CT + surface import).
// One shape, both flat + categorized modes: a face-sized avatar · the name · the distilled-pitch subtitle
// ladder (elevatorPitch → tag line → handle) · a per-character themeOverride accent dot · a star chip
// (immediate toggle) · a dual-purpose Chat CTA (resume-or-new — the surface hands `onChat` the smart
// target). In §4.6 bulk mode the row's click toggles a selection checkbox instead of opening the editor.
//
// A11y (side-eye item 13): the row is a `@orb/ui/list-row`, so the select/toggle body is a native
// `<button>` and every trailing control (star · chat · checkbox) is a SIBLING `action` outside it — no
// interactive element nested in another, no `stopPropagation` crutch.
//
// Named `*Tile` — PD-126: `@orb/contracts` owns `CharacterCard` as the ST wire-card type; this is the React
// row component, disambiguated to avoid the same-name collision. Pure leaf: props in, callbacks out.

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeOverride } from "@orb/contracts/theme";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the character-library-surface.tsx precedent).
import { Icon, MessagesSquare, Star } from "@orb/ui/icons";
import { ListRow } from "@orb/ui/list-row";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { initialsFor } from "../lib/initials";

export interface CharacterCardItem {
  readonly id: string;
  readonly name: string;
  /** Identity slug — the subtitle ladder's last fallback. */
  readonly handle: string;
  readonly archived: boolean;
  readonly starred: boolean;
  /** CAS key (`assets` join) — null when no avatar; the source, never `avatarAssetId` (blob route keyed
   *  by hash — `blobUrl`). */
  readonly avatarHash: string | null;
  /** The discovery-domain distilled one-liner — the subtitle's first choice (§4.4). `null` until distilled. */
  readonly elevatorPitch: string | null;
  /** Per-character theme (§8) — paints the accent dot; `null` inherits the global accent. */
  readonly themeOverride: ThemeOverride | null;
  /** Advisory card-heft estimate (`CharacterSummary.tokenSize`) — the §4.4 hover/:focus-within raw-metadata
   *  reveal (`handle · tokenSize`), the progressive-disclosure counterpart to the always-on subtitle. */
  readonly tokenSize: number;
  /** The accepted canonical tags (pending suggestions already excluded upstream — CharacterSummary). */
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
}

// §4.4 / §13 progressive disclosure (rule 4): the small Chat CTA fades in place on row hover OR
// :focus-within (keyboard parity), always visible on a coarse pointer — opacity-only, since it stays a
// modest ~icon width in `actions` and never starves the title. The WIDE `handle · tokenSize` metadata is
// NOT an action: it rides the list-row `subtitleReveal` slot (a display-swap of the subtitle in the content
// column), so it can never contend with these buttons for width (the earlier bleed-across-buttons P1).
const ROW_REVEAL =
  "opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";

export interface CharacterCardTileProps {
  readonly character: CharacterCardItem;
  /** The editor selection (§4.4) — the row's `aria-current` skin in normal mode. */
  readonly selected: boolean;
  /** §4.6 bulk mode: the click toggles selection (not open-editor) and a checkbox replaces the actions. */
  readonly bulkMode: boolean;
  readonly bulkSelected: boolean;
  /** Open this character's editor in CONTENT — the row's primary click in normal mode. */
  readonly onSelect: (id: string) => void;
  /** Toggle this row's bulk-selection membership — the primary click in bulk mode. */
  readonly onToggleBulk: (id: string) => void;
  /** The dual-purpose Chat CTA (§4.4/§9c) — the surface passes a handler that resumes the most-recent chat
   *  or starts a new one; the row is agnostic to which. */
  readonly onChat: (id: string) => void;
  /** Immediate star toggle (§2 flagEdit) — fires `{ characterId, starred: next }`. */
  readonly onToggleStar: (id: string, next: boolean) => void;
}

/** One character row — the library list's `renderItem` output (see `<VirtualList>` in the surface). */
export function CharacterCardTile({
  character,
  selected,
  bulkMode,
  bulkSelected,
  onSelect,
  onToggleBulk,
  onChat,
  onToggleStar,
}: CharacterCardTileProps): ReactElement {
  const visibleTags = character.tags.filter((tag) => !tag.isHiddenOnCard);
  const tagLine = visibleTags.length === 0 ? null : visibleTags.map((tag) => tag.name).join(" · ");
  // §4.4 fallback ladder: the distilled pitch → the tag line → the handle. Always a line (never blank).
  const subtitle = character.elevatorPitch ?? tagLine ?? character.handle;
  // `exactOptionalPropertyTypes`: omit `src` entirely for a missing avatar so it falls to the fallback.
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };

  // §8: the accent dot is painted via `<ThemeScope>` — the gate-enforced path for a themeOverride to reach
  // the DOM — which emits the override's accent as `--color-primary`, so `bg-primary` reads it. Empty tokens
  // (a `null` override) inherit the global accent. Decorative (empty content → no accessible-name leak).
  const accentDot = (
    <ThemeScope
      className="size-2 shrink-0 self-center rounded-full bg-primary"
      tokens={character.themeOverride ?? {}}
    >
      {null}
    </ThemeScope>
  );

  const normalActions = (
    <>
      {character.archived ? (
        <Badge intent="warning" size="sm">
          Archived
        </Badge>
      ) : null}
      {accentDot}
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
      {/* The dual-purpose Chat CTA — the row's hover/:focus-within reveal (the 1-click core loop, §9c). */}
      <Button
        aria-label={`Chat with ${character.name}`}
        className={ROW_REVEAL}
        intent="primary"
        onClick={(): void => onChat(character.id)}
        size="icon"
        type="button"
      >
        <Icon icon={MessagesSquare} size="sm" />
      </Button>
    </>
  );

  const bulkActions = (
    <Checkbox
      aria-label={`Select ${character.name}`}
      checked={bulkSelected}
      onCheckedChange={(): void => onToggleBulk(character.id)}
    />
  );

  return (
    <ListRow
      actions={bulkMode ? bulkActions : normalActions}
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
      // §4.4 raw-metadata reveal — the content-column subtitle display-swap (never in `actions`, so it can't
      // crowd the buttons). Not in bulk mode (the row is a checkbox target, no hover disclosure).
      {...(bulkMode ? {} : { subtitleReveal: `${character.handle} · ${character.tokenSize}` })}
    />
  );
}
