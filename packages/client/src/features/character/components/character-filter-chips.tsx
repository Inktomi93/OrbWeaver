// §4.5 filter chips (under the search row): Favorites-only · Archived (opt-in disclosure — hidden by
// default) · a tag multi-select. Favorites/Archived are pressable on/off `@orb/ui/toggle`s (R4). The TAG
// chips are not: they carry THREE states (off → include → exclude → off, the ST `toggleTagThreeState`
// capability neither our lineage nor neo ever built), and `aria-pressed` cannot express three. They are
// `Button`s whose accessible NAME states which of the three they are in — the state is never carried by
// colour alone, and never by hover — AND what activating will do next, because a cycling control whose
// name states only its state leaves a screen-reader user to guess where the cycle goes (side-eye P2).
//
// THE ROW IS CAPPED (side-eye 2026-08-03 P2). Uncapped it was a WALL: measured at the owner's library, 22
// chips built a 298px block in a 290px-wide pane — 40% of the pane, above the first character row — and
// 344px of a 740px mobile viewport. Worse, the vocabulary is derived from the LOADED rows, so it GREW and
// reflowed underneath the reader as pages arrived. The cap holds the block to one glance; an ACTIVE chip is
// never hidden by it (a filter you cannot see is a filter you cannot turn off), and the rest are one
// disclosure away.
//
// AN ACTIVE FILTER ALWAYS GETS A CHIP (owner's live P1, 2026-08-13). The vocabulary used to be derived from
// the LOADED ROWS, so an active tag entry that matched no loaded row rendered nothing at all: the library
// came back empty, no chip said why, and the only cure was wiping localStorage. The vocabulary is the
// server's tag library now, and this component closes the last hole — an active entry that is in NO
// vocabulary at all (a deleted tag, a foreign id from a previous dev era) still renders, named "Deleted
// tag", so it can be cleared by the same cycle as any other chip. Validating/neutralizing such an id is a
// separate work item (design doc W5); making it VISIBLE is this one.
//
// Pure leaf apart from that disclosure: the states + the tag vocabulary come from the surface (the library
// view-prefs store + `tag.listTagsWithUsage`, most-used first), the chips fire store actions.

import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Check, Icon, Minus } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";
import { useState } from "react";
import type { TagFilterEntry, TagFilterState } from "#lib";
import { tagFilterStateOf } from "#lib";

interface FilterChipTag {
  readonly id: TagId;
  readonly name: string;
}

/** How many tag chips the row shows before the disclosure — one glance, at the 290px pane's width. */
const VISIBLE_TAG_CHIPS = 8;

/** How one chip STATE presents itself. One interface + one total Record = a fourth state is a tsc error
 *  here, not a chip that renders as "off" and filters as something else. */
interface TagChipPresentation {
  /** The state word inside the chip's accessible name — the ONLY place the state is announced. */
  readonly announced: string;
  /** What ACTIVATING does from here — the second half of the accessible name, so the cycle is discoverable
   *  without operating it blind. */
  readonly next: string;
  readonly intent: "ghost" | "secondary";
  /** The persistent state ring (`inset-ring-*`, the state layer — never the focus `ring-*` layer) plus,
   *  for the exclusion arm, the strike that says "not this one" without relying on the ring's hue. */
  readonly className: string;
  /** A shape cue beside the name, so include ⇄ exclude is distinguishable without colour. */
  readonly icon: LucideIcon | null;
}

const TAG_CHIP_PRESENTATION: Record<TagFilterState, TagChipPresentation> = {
  off: { announced: "off", next: "activate to include", intent: "ghost", className: "", icon: null },
  include: { announced: "included", next: "activate to exclude", intent: "secondary", className: "inset-ring-2 inset-ring-ring", icon: Check },
  exclude: {
    announced: "excluded",
    next: "activate to clear",
    intent: "secondary",
    className: "inset-ring-2 inset-ring-destructive line-through",
    icon: Minus,
  },
};

export interface CharacterFilterChipsProps {
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  /** The active three-state tag entries (a tag absent from the list is `off`). */
  readonly tagFilter: readonly TagFilterEntry[];
  /** The owner's tag library, MOST-USED FIRST — the tag-filter vocabulary (ranked by the surface, so the
   *  cap below keeps the chips that earn the space). An ACTIVE entry missing from this list still gets a
   *  chip; see `orphanChips`. */
  readonly availableTags: readonly FilterChipTag[];
  readonly onToggleFavorites: () => void;
  readonly onToggleArchived: () => void;
  /** Advances ONE tag chip one step around the cycle. */
  readonly onCycleTag: (tagId: TagId) => void;
}

/** The filter-chip row — Favorites · Archived · the capped three-state tag chips + their disclosure. */
export function CharacterFilterChips({
  favoritesOnly,
  showArchived,
  tagFilter,
  availableTags,
  onToggleFavorites,
  onToggleArchived,
  onCycleTag,
}: CharacterFilterChipsProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  // Index-based, so the surface's most-used-first order survives; an ACTIVE chip is exempt from the cap.
  const visible = expanded ? availableTags : availableTags.filter((tag, at) => at < VISIBLE_TAG_CHIPS || tagFilterStateOf(tagFilter, tag.id) !== "off");
  const hiddenCount = availableTags.length - visible.length;
  const orphans = orphanChips(tagFilter, availableTags);
  return (
    <Row aria-label="Filters" className="flex-wrap" gap="field" role="group">
      <Toggle aria-label="Show only favorites" onPressedChange={onToggleFavorites} pressed={favoritesOnly} size="sm">
        Favorites
      </Toggle>
      <Toggle aria-label="Show archived characters" onPressedChange={onToggleArchived} pressed={showArchived} size="sm">
        Archived
      </Toggle>
      {/* The orphans lead the row: they are the ones actively narrowing the library for a reason nothing
          else on screen explains, so they are the first thing to find and clear. */}
      {orphans.map((tag) => (
        <TagFilterChip key={tag.id} onCycle={onCycleTag} state={tagFilterStateOf(tagFilter, tag.id)} tag={tag} />
      ))}
      {visible.map((tag) => (
        <TagFilterChip key={tag.id} onCycle={onCycleTag} state={tagFilterStateOf(tagFilter, tag.id)} tag={tag} />
      ))}
      {hiddenCount > 0 ? (
        <Button intent="ghost" onClick={(): void => setExpanded(true)} size="sm" type="button">
          {`+${String(hiddenCount)} more`}
        </Button>
      ) : null}
      {expanded && availableTags.length > VISIBLE_TAG_CHIPS ? (
        <Button intent="ghost" onClick={(): void => setExpanded(false)} size="sm" type="button">
          Show fewer
        </Button>
      ) : null}
    </Row>
  );
}

/** The name an orphaned filter's chip carries — it has no tag row left to take one from, and a bare id is
 *  not a thing a user can recognise or act on. */
const DELETED_TAG_LABEL = "Deleted tag";

/** ACTIVE filter entries with no tag in the vocabulary — the invisible-filter class made visible. The
 *  vocabulary is the whole tag library, so reaching this list means the tag itself is gone (deleted, merged,
 *  or an id from a wiped dev era), and the entry is silently narrowing the list with nothing to say so. */
function orphanChips(tagFilter: readonly TagFilterEntry[], availableTags: readonly FilterChipTag[]): readonly FilterChipTag[] {
  const known = new Set(availableTags.map((tag) => tag.id));
  return tagFilter.filter((entry) => !known.has(entry.id)).map((entry) => ({ id: entry.id, name: DELETED_TAG_LABEL }));
}

/** One tri-state tag chip. Its accessible name is `Filter by <tag>: <state> — <what activating does>` — a
 *  screen-reader user hears the state change on every activation AND where the cycle goes next, which is
 *  what makes a cycling control usable at all.
 *
 *  IT TRUNCATES (side-eye 2026-08-03 P1): the server accepts a 72-character tag name, and `Button`'s
 *  `whitespace-nowrap` with no cap turned one into a 475px chip inside a 354px container — with scrollWidth
 *  equal to clientWidth, so nothing was truncating: it simply overflowed and was clipped mid-word. The
 *  cap is the CONTAINER (`max-w-full`), not a magic length, and the label truncates inside it exactly the
 *  way a `ListRow` title does. The `title` carries the full name for a pointer; the accessible NAME already
 *  carried it in full and still does. */
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
      aria-label={`Filter by ${tag.name}: ${presentation.announced} — ${presentation.next}`}
      className={`min-w-0 max-w-full ${presentation.className}`}
      data-tag-filter-state={state}
      intent={presentation.intent}
      onClick={(): void => onCycle(tag.id)}
      size="sm"
      title={tag.name}
      type="button"
    >
      {presentation.icon === null ? null : <Icon icon={presentation.icon} size="xs" />}
      {/* `text-inherit` is load-bearing: `voice="label"` matches the `sm` control's own type step but would
          also repaint the ink `text-foreground`, erasing the ghost/secondary weight distinction that IS the
          off-vs-active reading at rest. The chip's intent owns the colour; this span owns only the clip. */}
      <Text as="span" className="min-w-0 truncate text-inherit" voice="label">
        {tag.name}
      </Text>
    </Button>
  );
}
