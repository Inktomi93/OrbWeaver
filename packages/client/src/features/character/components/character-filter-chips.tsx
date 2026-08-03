// §4.5 filter chips (under the search row): Favorites-only · Archived (opt-in disclosure — hidden by
// default) · a tag multi-select. Favorites/Archived are pressable on/off `@orb/ui/toggle`s (R4). The TAG
// chips are not: they carry THREE states (off → include → exclude → off, the ST `toggleTagThreeState`
// capability neither our lineage nor neo ever built), and `aria-pressed` cannot express three. They are
// `Button`s whose accessible NAME states which of the three they are in — the state is never carried by
// colour alone, and never by hover.
//
// Pure leaf: the states + the tag vocabulary come from the surface (the library view-prefs store + the
// loaded rows' tags), the chips fire store actions.

import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Check, Icon, Minus } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";
import type { TagFilterEntry, TagFilterState } from "#lib";
import { tagFilterStateOf } from "#lib";

interface FilterChipTag {
  readonly id: TagId;
  readonly name: string;
}

/** How one chip STATE presents itself. One interface + one total Record = a fourth state is a tsc error
 *  here, not a chip that renders as "off" and filters as something else. */
interface TagChipPresentation {
  /** The state word inside the chip's accessible name — the ONLY place the state is announced. */
  readonly announced: string;
  readonly intent: "ghost" | "secondary";
  /** The persistent state ring (`inset-ring-*`, the state layer — never the focus `ring-*` layer) plus,
   *  for the exclusion arm, the strike that says "not this one" without relying on the ring's hue. */
  readonly className: string;
  /** A shape cue beside the name, so include ⇄ exclude is distinguishable without colour. */
  readonly icon: LucideIcon | null;
}

const TAG_CHIP_PRESENTATION: Record<TagFilterState, TagChipPresentation> = {
  off: { announced: "off", intent: "ghost", className: "", icon: null },
  include: { announced: "included", intent: "secondary", className: "inset-ring-2 inset-ring-ring", icon: Check },
  exclude: { announced: "excluded", intent: "secondary", className: "inset-ring-2 inset-ring-destructive line-through", icon: Minus },
};

export interface CharacterFilterChipsProps {
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  /** The active three-state tag entries (a tag absent from the list is `off`). */
  readonly tagFilter: readonly TagFilterEntry[];
  /** The visible tags across the loaded rows — the tag-filter vocabulary (deduped by the surface). */
  readonly availableTags: readonly FilterChipTag[];
  readonly onToggleFavorites: () => void;
  readonly onToggleArchived: () => void;
  /** Advances ONE tag chip one step around the cycle. */
  readonly onCycleTag: (tagId: TagId) => void;
}

/** The filter-chip row — Favorites · Archived · one three-state chip per available tag. */
export function CharacterFilterChips({
  favoritesOnly,
  showArchived,
  tagFilter,
  availableTags,
  onToggleFavorites,
  onToggleArchived,
  onCycleTag,
}: CharacterFilterChipsProps): ReactElement {
  return (
    <Row aria-label="Filters" className="flex-wrap" gap="field" role="group">
      <Toggle aria-label="Show only favorites" onPressedChange={onToggleFavorites} pressed={favoritesOnly} size="sm">
        Favorites
      </Toggle>
      <Toggle aria-label="Show archived characters" onPressedChange={onToggleArchived} pressed={showArchived} size="sm">
        Archived
      </Toggle>
      {availableTags.map((tag) => (
        <TagFilterChip key={tag.id} onCycle={onCycleTag} state={tagFilterStateOf(tagFilter, tag.id)} tag={tag} />
      ))}
    </Row>
  );
}

/** One tri-state tag chip. Its accessible name is `Filter by <tag>: <state>` — a screen-reader user hears
 *  the state change on every activation, which is what makes a cycling control usable at all. */
function TagFilterChip({
  tag,
  state,
  onCycle,
}: {
  readonly tag: FilterChipTag;
  readonly state: TagFilterState;
  readonly onCycle: (tagId: TagId) => void;
}): ReactElement {
  const presentation = TAG_CHIP_PRESENTATION[state];
  return (
    <Button
      aria-label={`Filter by ${tag.name}: ${presentation.announced}`}
      className={presentation.className}
      data-tag-filter-state={state}
      intent={presentation.intent}
      onClick={(): void => onCycle(tag.id)}
      size="sm"
      type="button"
    >
      {presentation.icon === null ? null : <Icon icon={presentation.icon} size="xs" />}
      {tag.name}
    </Button>
  );
}
