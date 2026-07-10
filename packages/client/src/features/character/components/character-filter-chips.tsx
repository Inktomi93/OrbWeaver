// §4.5 filter chips (under the search row): Favorites-only · Archived (opt-in disclosure — hidden by
// default) · a tag multi-select with AND-semantics. Each is a pressable on/off `@orb/ui/toggle` (R4:
// pressable on/off → Toggle, never a hand-rolled aria-pressed div). Pure leaf: the pressed states + the
// tag vocabulary come from the surface (the library view-prefs store + the loaded rows' tags), the
// toggles fire store actions.

import type { TagId } from "@orb/kit/ids";
import { Row } from "@orb/ui/layout";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";

export interface FilterChipTag {
  readonly id: TagId;
  readonly name: string;
}

export interface CharacterFilterChipsProps {
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  readonly tagFilter: readonly TagId[];
  /** The visible tags across the loaded rows — the tag-filter vocabulary (deduped by the surface). */
  readonly availableTags: readonly FilterChipTag[];
  readonly onToggleFavorites: () => void;
  readonly onToggleArchived: () => void;
  readonly onToggleTag: (tagId: TagId) => void;
}

/** The filter-chip row — Favorites · Archived · one chip per available tag (AND-selected). */
export function CharacterFilterChips({
  favoritesOnly,
  showArchived,
  tagFilter,
  availableTags,
  onToggleFavorites,
  onToggleArchived,
  onToggleTag,
}: CharacterFilterChipsProps): ReactElement {
  return (
    <Row aria-label="Filters" className="flex-wrap" gap="field" role="group">
      <Toggle
        aria-label="Show only favorites"
        onPressedChange={onToggleFavorites}
        pressed={favoritesOnly}
        size="sm"
      >
        Favorites
      </Toggle>
      <Toggle
        aria-label="Show archived characters"
        onPressedChange={onToggleArchived}
        pressed={showArchived}
        size="sm"
      >
        Archived
      </Toggle>
      {availableTags.map((tag) => (
        <Toggle
          aria-label={`Filter by ${tag.name}`}
          key={tag.id}
          onPressedChange={(): void => onToggleTag(tag.id)}
          pressed={tagFilter.includes(tag.id)}
          size="sm"
        >
          {tag.name}
        </Toggle>
      ))}
    </Row>
  );
}
