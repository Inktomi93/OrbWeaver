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
import type { ButtonProps } from "@orb/ui/button";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Archive, Check, Icon, Minus, Star } from "@orb/ui/icons";
import { Section } from "@orb/ui/layout";
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
  /** The primitive's own selection layer (the fill + the persistent `inset-ring-*` state ring, and the
   *  strike on the exclusion arm). DERIVED from `Button`, never re-spelled: this used to be an `intent`
   *  plus a hand-written `className` of ring utilities, i.e. a skin decided in a feature — which is how the
   *  chips ended up reading as a different class of thing from the scope toggles they sit beside. */
  readonly selection: NonNullable<ButtonProps["selection"]>;
  /** A shape cue beside the name, so include ⇄ exclude is distinguishable without colour. */
  readonly icon: LucideIcon | null;
}

const TAG_CHIP_PRESENTATION: Record<TagFilterState, TagChipPresentation> = {
  off: { announced: "off", next: "activate to include", selection: "none", icon: null },
  include: { announced: "included", next: "activate to exclude", selection: "on", icon: Check },
  exclude: { announced: "excluded", next: "activate to clear", selection: "negated", icon: Minus },
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
  /** Drops every active filter at once. Rendered ONLY while something is on — an always-present "clear"
   *  beside a rail that is already at rest is a control with nothing to do. */
  readonly onClearFilters: () => void;
}

/** The filter group — its NAME, its active count, the scope pills, the capped three-state tag chips, and
 *  the two text affordances (disclosure + clear).
 *
 *  IT IS A NAMED GROUP NOW, INLINE (program #102 variant B). The `role="group" aria-label="Filters"` has
 *  been here all along: the accessibility tree already carried the grouping the pixels refused to show,
 *  and `+N more` — not a filter at all — sat inside it looking exactly like one. A `Section` with a kicker
 *  in the `inline` layout draws the CD1 pair (a name + a hairline, never a box) with the rule as the
 *  section's own top edge and the kicker leading the control line, which is what makes the naming
 *  height-neutral instead of costing a chip row. */
export function CharacterFilterChips({
  favoritesOnly,
  showArchived,
  tagFilter,
  availableTags,
  onToggleFavorites,
  onToggleArchived,
  onCycleTag,
  onClearFilters,
}: CharacterFilterChipsProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  // Index-based, so the surface's most-used-first order survives; an ACTIVE chip is exempt from the cap.
  const visible = expanded ? availableTags : availableTags.filter((tag, at) => at < VISIBLE_TAG_CHIPS || tagFilterStateOf(tagFilter, tag.id) !== "off");
  const hiddenCount = availableTags.length - visible.length;
  const orphans = orphanChips(tagFilter, availableTags);
  // What the group's datum COUNTS: the lenses that narrow the library. `showArchived` is deliberately not
  // one — its ON state WIDENS the set (archived rows shown beside the rest), so counting it would print
  // "1 filter" over a library nothing is filtering (the surface's own `filtersActive` draws the same line).
  const activeCount = tagFilter.length + (favoritesOnly ? 1 : 0);
  return (
    <Section aria-label="Filters" kicker="Filters" kickerLayout="inline" role="group">
      {/* The count rides the group's name in the `datum` voice — the ONE number this rail produces, and the
          only thing on the line that is a value rather than a control. */}
      {activeCount > 0 ? (
        <Text className="mr-field" voice="datum">
          {String(activeCount)}
        </Text>
      ) : null}
      {/* SCOPE and TAG share one register on purpose — Favorites and Archived ARE filters, they perform the
          same act — and are told apart by a leading glyph rather than by a second box or a colour. */}
      <Toggle aria-label="Show only favorites" intent="outline" onPressedChange={onToggleFavorites} pressed={favoritesOnly} shape="pill" size="chip">
        <Icon icon={Star} size="xs" />
        Favorites
      </Toggle>
      <Toggle aria-label="Show archived characters" intent="outline" onPressedChange={onToggleArchived} pressed={showArchived} shape="pill" size="chip">
        <Icon icon={Archive} size="xs" />
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
      {hiddenCount > 0 ? <RailAction label={`+${String(hiddenCount)} more`} onClick={(): void => setExpanded(true)} /> : null}
      {expanded && availableTags.length > VISIBLE_TAG_CHIPS ? <RailAction label="Show fewer" onClick={(): void => setExpanded(false)} /> : null}
      {activeCount > 0 ? <RailAction label="Clear all" onClick={onClearFilters} /> : null}
    </Section>
  );
}

/** The rail's TEXT affordances — the tag-cap disclosure and the clear-all. They are the third register:
 *  neither of them FILTERS anything, so neither wears a filter's edge. `ghost` draws no box at rest at all
 *  (the box appears on hover, where it is an affordance rather than a claim of kinship), which is what
 *  separates them from the outlined pills they sit among now that the pills are actually outlined.
 *
 *  TWO DELIBERATE DEVIATIONS from the approved mockup, both receipted:
 *  1. The mockup sets these at `--text-micro` (10.5px, the `gloss` voice). A #102 review already ruled on
 *     that exact shape — "10.5px interactive text was the review's #15 (seven nodes under the readable
 *     floor)", recorded on the `credit` voice in `ui/src/primitives/text/variants.ts` — and these ARE
 *     interactive text. They keep the label step; the absent edge carries the register.
 *  2. They take the `chip` BOX (the rail cell's touch-target height — which is what the mockup gives them
 *     too: `height: var(--spacing-touch-target)`, no border, no fill) rather than the floorless `inline`
 *     size a "no box at all" reading invites. `inline` is exactly what `no-floorless-control-in-wrap`
 *     exists to stop: a full-width 44px hit pseudo on an ~18px text button, repeated inside a `flex-wrap`
 *     rail, is the measured weather-picker collision. A `ghost` box paints nothing at rest anyway, so the
 *     boxless READING costs nothing and the tap target stays real. */
function RailAction({ label, onClick }: { readonly label: string; readonly onClick: () => void }): ReactElement {
  return (
    <Button intent="ghost" onClick={onClick} size="chip" type="button">
      {label}
    </Button>
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
      className="min-w-0 max-w-full"
      data-tag-filter-state={state}
      intent="outline"
      onClick={(): void => onCycle(tag.id)}
      selection={presentation.selection}
      shape="pill"
      size="chip"
      title={tag.name}
      type="button"
    >
      {presentation.icon === null ? null : <Icon icon={presentation.icon} size="xs" />}
      {/* `text-inherit` is load-bearing: `voice="label"` matches the `chip` box's own type step but would
          also repaint the ink `text-foreground`, erasing the muted-vs-selected reading that tells an off
          chip from an on one at rest. The chip's intent + selection own the colour; this span owns only
          the clip. */}
      <Text as="span" className="min-w-0 truncate text-inherit" voice="label">
        {tag.name}
      </Text>
    </Button>
  );
}
