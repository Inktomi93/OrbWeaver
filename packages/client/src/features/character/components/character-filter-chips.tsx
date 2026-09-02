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
// …AND THE DISCLOSURE IS BOUNDED (side-eye 2026-08-17 P1 — se-chars-more.png / se-chars-trap.json /
// perf-meter se-chars-expandperf.json). "+543 more" used to flip `expanded` and render the WHOLE vocabulary
// back into this wrapping rail: 551 chips, a 5,957px chip wall, the character list's own height driven to
// ZERO, the only way out 5.3k px away, and a 648ms blocking mount on the click. That is the exact defect the
// cap above was minted against, at 25× scale. So the expansion is a REGION, not a longer rail
// ({@link TagVocabularyPanel}): bounded height with its own scroller, its exit and a tag-search index above
// the scroll (never scrolled away), chips mounted in CHUNKS so the click never blocks a frame, and the
// character list still on screen underneath. The tag vocabulary stays fully visible as a concept — this is
// where it lives, not a picker behind a dialog (owner ruling 2026-08-17: variant C, the full-picker IA, was
// DECLINED).
//
// …AND THE VOCABULARY IS COLLAPSED BY DEFAULT (#491, side-eye 2026-08-22 rail-characters — the review's own
// "single biggest opportunity"). At the owner's 327-character library this block was measured eating 34% of
// the desktop pane and 42% of the phone (five rows visible of 327), density-immune (`compact` moved the
// chrome 272px → 260px while the row went 44 → 40), and costing 18 tab stops before the first character —
// 563 with the vocabulary open. The block is a DISCLOSURE now, shut on first visit.
//
// WHAT DOES NOT COLLAPSE, and that is the whole design: "a filter you cannot see is a filter you cannot turn
// off" (the owner's 2026-08-13 P1, stated below) is not negotiable, so the SCOPE pills and every ACTIVE chip
// — orphans included — render in BOTH states, together with the `N active` datum and Clear all. Only the
// INACTIVE vocabulary, its `+N more` and the expansion panel go behind the disclosure. Nothing that is
// currently narrowing the library can be hidden by it, and the scope pills never move in the DOM (a control
// that relocates when you press it takes the focus with it).
//
// AN ACTIVE FILTER ALWAYS GETS A CHIP (owner's live P1, 2026-08-13). The vocabulary used to be derived from
// the LOADED ROWS, so an active tag entry that matched no loaded row rendered nothing at all: the library
// came back empty, no chip said why, and the only cure was wiping localStorage. The vocabulary is the
// server's tag library now, and this component closes the last hole — an active entry that is in NO
// vocabulary at all (a deleted tag, a foreign id from a previous dev era) still renders, named "Deleted
// tag", so it can be cleared by the same cycle as any other chip. Validating/neutralizing such an id is a
// separate work item (design doc W5); making it VISIBLE is this one. Inside the expansion the same rule is
// kept by ORDER, not by pinning: `vocabularyPanelTags` floats the active entries to the head of the panel,
// so an active chip is above the fold of a bounded scroller rather than 400 chips down it.
//
// Pure leaf apart from that disclosure: the states + the tag vocabulary come from the surface (the library
// view-prefs store + `tag.listTagsWithUsage`, most-used first), the chips fire store actions.

import type { TagId } from "@orb/kit/ids";
import type { LucideIcon } from "@orb/ui/icons";
import { Archive, Icon, Star } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import type { TagFilterEntry } from "#lib";
import { tagFilterStateOf } from "#lib";
import type { LibraryChipTag } from "../lib/character-library-lens.ts";
import { RailAction, TagFilterChip, TagVocabularyPanel } from "./character-filter-rail-parts.tsx";

/** How many tag chips the row shows before the disclosure — one glance, at the 290px pane's width. */
const VISIBLE_TAG_CHIPS = 8;
/** The chip lines the tag vocabulary lands as (side-eye 2026-08-17 P2). `tag.listTagsWithUsage` settles
 *  ~750ms after first paint, and the rail grew underneath the reader — measured
 *  `[cls] shift 0.0085 unexpected · aside[aria-label=Characters list] moved 0px,64px` on every cold load,
 *  i.e. TWO lines of the pre-#102-review chip. Reserving the lines while the read is in flight is what
 *  makes the arrival free.
 *
 *  Pinned by EQUALITY, not by the review's number — the CT holds the group's height IDENTICAL held-vs-
 *  settled at `RAIL_PANE_PX`, so this constant cannot drift away from the rail it stands in for without
 *  going red. (It is the review's two either way: the glyph-cell widening that would have made it three was
 *  refused — see {@link TagFilterChip}.)
 *
 *  Named keys, not indices — a fixed list of lines is a set of things, not array positions. */
const RESERVED_CHIP_LINES = ["reserve-line-1", "reserve-line-2"] as const;

export interface CharacterFilterChipsProps {
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  /** The active three-state tag entries (a tag absent from the list is `off`). */
  readonly tagFilter: readonly TagFilterEntry[];
  /** The owner's tag library, MOST-USED FIRST — the tag-filter vocabulary (ranked by the surface, so the
   *  cap below keeps the chips that earn the space). An ACTIVE entry missing from this list still gets a
   *  chip; see `orphanChips`. */
  readonly availableTags: readonly LibraryChipTag[];
  /** The tag-library read is still in flight — the rail RESERVES the lines the vocabulary will land as,
   *  instead of shoving the character list down when it arrives. */
  readonly vocabularyPending: boolean;
  /** What the pane's live region SAYS about the current lens ("12 characters"). Spoken, not printed
   *  (#518): the visible census has one home and it is the LIST band. See the datum line's own note. */
  readonly resultLabel: string;
  /** Is the INACTIVE vocabulary on screen (#491)? Persisted by the library store, default `false`. */
  readonly open: boolean;
  readonly onToggleOpen: () => void;
  readonly onToggleFavorites: () => void;
  readonly onToggleArchived: () => void;
  /** Advances ONE tag chip one step around the cycle. */
  readonly onCycleTag: (tagId: TagId) => void;
  /** Drops every active filter at once. Rendered ONLY while something is on — an always-present "clear"
   *  beside a rail that is already at rest is a control with nothing to do. */
  readonly onClearFilters: () => void;
}

/** The filter group — its NAME, its datum line, the scope pills, the capped three-state tag chips, the two
 *  text affordances (disclosure + clear), and the bounded expansion.
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
  vocabularyPending,
  resultLabel,
  open,
  onToggleOpen,
  onToggleFavorites,
  onToggleArchived,
  onCycleTag,
  onClearFilters,
}: CharacterFilterChipsProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  // Index-based, so the surface's most-used-first order survives; an ACTIVE chip is exempt from the cap.
  const capped = availableTags.filter((tag, at) => at < VISIBLE_TAG_CHIPS || tagFilterStateOf(tagFilter, tag.id) !== "off");
  // COLLAPSED keeps only the chips that are DOING something (#491). Same array, same keys, same parent slot,
  // so a chip present in both states keeps its element identity across the disclosure — and while OPEN the
  // rail is byte-identical to what it always rendered, so cycling a chip still moves nothing upstream of it.
  const visible = open ? capped : capped.filter((tag) => tagFilterStateOf(tagFilter, tag.id) !== "off");
  const hiddenCount = availableTags.length - capped.length;
  // The `+N more` PANEL only ever exists inside an open group — the group's own disclosure is the outer one,
  // and a stale inner `expanded` must not resurrect a 551-chip region under a collapsed rail.
  const panelOpen = expanded && open;
  const orphans = orphanChips(tagFilter, availableTags);
  // What the group's datum COUNTS: the lenses that narrow the library. `showArchived` is deliberately not
  // one — its ON state WIDENS the set (archived rows shown beside the rest), so counting it would print
  // "1 filter" over a library nothing is filtering (the surface's own `filtersActive` draws the same line).
  const activeCount = tagFilter.length + (favoritesOnly ? 1 : 0);
  return (
    <Section aria-label="Filters" kicker="Filters" kickerLayout="inline" role="group">
      {/* SCOPE and TAG share one register on purpose — Favorites and Archived ARE filters, they perform the
          same act — and are told apart by a leading glyph rather than by a second box or a colour.
          THEY COLLAPSE ONLY WHILE OFF (#491). A PRESSED scope pill is a filter that is currently narrowing
          (or widening) the library, so the invariant applies to it exactly as it does to a tag chip: it
          renders in both states. An UNPRESSED one is vocabulary, and vocabulary is what the disclosure is
          for. Nothing MOVES either way — the collapsed rail is the same child list with entries absent, in
          the same order, under the same keys, so a pill that survives keeps its element identity and its
          focus. (Pressing a visible pill OFF while collapsed unmounts it, which is the same shape as
          "Clear all" unmounting itself and has been the rail's behaviour since it shipped.) */}
      <ScopePill glyph={Star} label="Favorites" name="Show only favorites" onToggle={onToggleFavorites} pressed={favoritesOnly} show={open} />
      <ScopePill glyph={Archive} label="Archived" name="Show archived characters" onToggle={onToggleArchived} pressed={showArchived} show={open} />
      {/* The orphans lead the row: they are the ones actively narrowing the library for a reason nothing
          else on screen explains, so they are the first thing to find and clear. They stay in the RAIL even
          while the vocabulary is expanded — the panel below is the tag LIBRARY, and by definition an orphan
          is not in it. */}
      {orphans.map((tag) => (
        <TagFilterChip key={tag.id} onCycle={onCycleTag} state={tagFilterStateOf(tagFilter, tag.id)} tag={tag} />
      ))}
      {vocabularyPending && open ? <VocabularyReserve /> : null}
      {panelOpen ? null : visible.map((tag) => <TagFilterChip key={tag.id} onCycle={onCycleTag} state={tagFilterStateOf(tagFilter, tag.id)} tag={tag} />)}
      {open && !panelOpen && hiddenCount > 0 ? (
        <RailAction
          accessibleName={`Show ${String(hiddenCount)} more tags`}
          controls={panelId}
          expanded={false}
          label={`+${String(hiddenCount)} more`}
          onClick={(): void => setExpanded(true)}
        />
      ) : null}
      {/* THE DISCLOSURE (#491). It is the last control on the line, after everything that is currently ON, so
          the collapsed rail reads "what is filtering" first and "where the rest lives" second. Its
          the `N active` datum below is the counter it discloses against, and it stays a datum rather than
          being folded in here — the group's OUTPUT belongs on the group's output line, in both states.
          NO `aria-controls`, unlike the `+N more` pair, and that is deliberate: what this discloses is the
          INACTIVE chips of the same wrapping rail, which have no container of their own and must not get one
          — a wrapper would either break the rail's wrap flow or split the chips into two ordered lists, and
          a two-list rail re-orders under the pointer the moment a chip is switched on (the exact reshuffle
          the datum line was moved out of the control line to stop). `aria-expanded` is the load-bearing
          half; APG lists `aria-controls` as optional for a disclosure. */}
      <VocabularyDisclosure onToggle={onToggleOpen} open={open} />
      {activeCount > 0 ? <RailAction accessibleName="Clear all filters" label="Clear all" onClick={onClearFilters} /> : null}
      {/* The panel element exists in BOTH states so the collapsed trigger's `aria-controls` resolves to a
          real node; only its contents are conditional. `hidden` (the Tailwind utility, i.e. `display:none`)
          rather than the HTML attribute: the attribute's UA rule loses to the `flex` this Stack sets. */}
      <Stack className={panelOpen ? "w-full" : "hidden"} gap="tight" id={panelId}>
        {panelOpen ? (
          <TagVocabularyPanel onCollapse={(): void => setExpanded(false)} onCycle={onCycleTag} panelId={panelId} tagFilter={tagFilter} tags={availableTags} />
        ) : null}
      </Stack>
      {/* THE DATUM LINE — the group's own full-width row. It used to carry TWO numbers; it carries one
          printed number and one spoken one now (#518, side-eye se-verify-1).
          WHY THE CENSUS STOPPED PRINTING: `327 characters` here sat ~130px under a band already reading
          `CHARACTERS 327`, in a 290px column — the same number twice, and at rest that is the only state
          anyone sees. A census has ONE home and it is the band (the chats precedent: a list band prints its
          list's count), which is why the band answers the LENS now rather than the library. What did NOT
          move is the ANNOUNCEMENT: this is still a mounted `role="status"` region stating what the current
          lens matched (side-eye 2026-08-03 P2), because the band's count is static text a screen-reader
          user has to go and read, and because a live region that appears with its first message announces
          nothing. It is `sr-only` — spoken, never a second printed census.
          IT IS A LINE OF ITS OWN FOR A GEOMETRIC REASON (side-eye 2026-08-17 P2): the active count used to
          be a flex ITEM of the wrapping control line, so the first selection MOUNTED it and shoved every
          chip 18px sideways — the row reshuffled under the pointer that had just pressed one of them. A
          full-width line AFTER the chips cannot push one whatever it says.
          IT IS LAST, NOT FIRST, for a second geometric reason: a `w-full` child placed before the controls
          would break the `inline` kicker layout's whole trick — the kicker stops LEADING the control line
          and stands on one of its own, which is the +22px variant A costs and this group is fenced against
          (measured: leading spelling 310.5px of chrome, trailing 262.5px).
          The count is CAPTIONED, never a bare digit: an unlabelled "2" beside the word "Filters" announced
          as the paragraph "2" and read, to anyone, as a debug counter (side-eye ARIA (a) + taste (b)). */}
      <Row className="w-full" gap="field" justify="between">
        <Text as="span" className="sr-only" role="status">
          {resultLabel}
        </Text>
        {activeCount > 0 ? <Text voice="datum">{`${String(activeCount)} active`}</Text> : null}
      </Row>
    </Section>
  );
}

/** One SCOPE pill (Favorites · Archived) — rendered while the rail is open, or whenever it is PRESSED.
 *  A pressed pill is a live filter, and the rail's oldest law is that a live filter is always on screen; an
 *  unpressed one is vocabulary, and the disclosure exists for vocabulary. See the render site's note for
 *  why nothing moves. */
function ScopePill({
  name,
  label,
  glyph,
  pressed,
  show,
  onToggle,
}: {
  readonly name: string;
  readonly label: string;
  readonly glyph: LucideIcon;
  readonly pressed: boolean;
  readonly show: boolean;
  readonly onToggle: () => void;
}): ReactElement | null {
  if (!(show || pressed)) {
    return null;
  }
  return (
    // THE RECEDING INK IS STATED HERE, beside the tag chips' own (#1141): `Toggle`'s `outline` arm reads
    // "must read as the same class of thing as the tag chips beside it", and since #969 flipped the
    // transparent intents to the host's inherited ink neither of them recedes on its own. The rail is the
    // host, so the rail says it — unprefixed, because `data-pressed:text-accent-foreground` (base) is a
    // variant key twMerge keeps and the attribute selector wins whenever the pill is ON.
    <Toggle aria-label={name} className="text-muted-foreground" intent="outline" onPressedChange={onToggle} pressed={pressed} shape="pill" size="chip">
      <Icon icon={glyph} size="xs" />
      {label}
    </Toggle>
  );
}

/** WHAT THE CLOSED DISCLOSURE OPENS (#519, side-eye se-verify-1) — the CONTENTS, not the act.
 *
 *  Collapsed, this group renders `FILTERS`, one text control and a datum, and the control said "More
 *  filters": a cold first-timer got no signal that Favorites, Archived, or a 551-entry tag vocabulary exist
 *  at all behind it (Nielsen #6, recognition over recall). Naming the three things is the cheapest possible
 *  fix and costs one rail cell's width — measured against the ratified 264px resting chrome fence in the
 *  surface CT, because a wider cell is a wrap risk at the 307px docked width. The OPEN arm keeps "Fewer
 *  filters": once the vocabulary is on screen, the contents are the thing you can already see, and the
 *  control's only remaining job is to say how to put it away. */
const CLOSED_DISCLOSURE_LABEL = "Favorites, archived & tags";

/** The group's OWN disclosure (#491) — the one control that decides whether the 551-entry tag vocabulary is
 *  on screen at all. Its own component so the group's render stays inside the complexity cap, and so the
 *  two labels can never drift apart. It wears the same grammar as its siblings (`RailAction`'s rule: the
 *  visible label is a SUBSTRING of the accessible name, WCAG 2.5.3) — the qualifier says what the act IS,
 *  so the control names an object when a rotor reads it out of the rail it sits in. */
function VocabularyDisclosure({ open, onToggle }: { readonly open: boolean; readonly onToggle: () => void }): ReactElement {
  return (
    <RailAction
      accessibleName={open ? "Fewer filters — hide the tag vocabulary" : `${CLOSED_DISCLOSURE_LABEL} — show more filters`}
      expanded={open}
      label={open ? "Fewer filters" : CLOSED_DISCLOSURE_LABEL}
      onClick={onToggle}
    />
  );
}

/** The lines the tag vocabulary is ABOUT to occupy, held open while `tag.listTagsWithUsage` is in flight.
 *  Two skeleton rows at the chip box + the rail's atom gap is exactly the 64px the list was measured being
 *  shoved down by on every cold load — and skeletons say "loading" out loud where a bare spacer would only
 *  say nothing quietly. */
function VocabularyReserve(): ReactElement {
  return (
    <Stack aria-hidden={true} className="w-full" gap="tight">
      {RESERVED_CHIP_LINES.map((line) => (
        <Skeleton className="h-touch-target w-full rounded-full" key={line} />
      ))}
    </Stack>
  );
}

/** The name an orphaned filter's chip carries — it has no tag row left to take one from, and a bare id is
 *  not a thing a user can recognise or act on. */
const DELETED_TAG_LABEL = "Deleted tag";

/** ACTIVE filter entries with no tag in the vocabulary — the invisible-filter class made visible. The
 *  vocabulary is the whole tag library, so reaching this list means the tag itself is gone (deleted, merged,
 *  or an id from a wiped dev era), and the entry is silently narrowing the list with nothing to say so. */
function orphanChips(tagFilter: readonly TagFilterEntry[], availableTags: readonly LibraryChipTag[]): readonly LibraryChipTag[] {
  const known = new Set(availableTags.map((tag) => tag.id));
  return tagFilter.filter((entry) => !known.has(entry.id)).map((entry) => ({ id: entry.id, name: DELETED_TAG_LABEL }));
}
