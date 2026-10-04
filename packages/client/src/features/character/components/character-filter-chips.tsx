// Favorites and Archived are two-state toggles; tag chips cycle off → include → exclude → off. aria-
// pressed cannot represent three states, so each Button names both its current state and its next action;
// neither color nor hover carries the state alone (§4.5).
//
// The visible row is capped, but active filters are never hidden. Expansion is a bounded
// TagVocabularyPanel with its own scroller, an exit and search above the scroll, and chunked mounts. The
// character list remains visible; the full-picker alternative was declined by the owner on 2026-08-17.
//
// The inactive vocabulary is collapsed on first visit (#491). Scope pills, all active chips including
// orphans, the active count, and Clear all render in both states. Scope pills never move in the DOM on
// activation. A filter that cannot be seen cannot be turned off.
//
// Vocabulary comes from the server, not loaded character rows. A persisted id absent from that vocabulary
// still renders as Deleted tag and can be cleared; validating it is a separate concern.
// vocabularyPanelTags places active entries first so they remain above the fold. The surface owns the
// state and ranked vocabulary; this leaf owns only disclosure.

import type { TagId } from "@orb/kit/ids";
import type { LucideIcon } from "@orb/ui/icons";
import { Archive, Icon, Star } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { RECEDED_INK } from "@orb/ui/lib";
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
      <VocabularyDisclosure hasTags={availableTags.length > 0} onToggle={onToggleOpen} open={open} />
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
          WHY THE CENSUS STOPPED PRINTING: `320 characters` here sat ~130px under a band already reading
          `CHARACTERS 320`, in a 290px column — the same number twice, and at rest that is the only state
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
    <Toggle aria-label={name} className={RECEDED_INK} intent="outline" onPressedChange={onToggle} pressed={pressed} shape="pill" size="chip">
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

/** THE SAME PROMISE, MINUS THE TAGS (side-eye 2026-09-02 nit 15, #1139). The label above names three things
 *  a first-timer cannot otherwise know exist — but on a library whose tag vocabulary is EMPTY the third one
 *  is not there, so both arms of the control were advertising a payload the disclosure could not deliver
 *  ("show more filters" opened two switches; "hide the tag vocabulary" hid nothing). An empty state is
 *  load-bearing: the honest label names what IS behind the door and says the tag vocabulary has not started
 *  yet, which is a fact a reader can act on (tag something) rather than a promise they will find broken. */
const CLOSED_DISCLOSURE_LABEL_NO_TAGS = "Favorites & archived";

/** The group's OWN disclosure (#491) — the one control that decides whether the 551-entry tag vocabulary is
 *  on screen at all. Its own component so the group's render stays inside the complexity cap, and so the
 *  two labels can never drift apart. It wears the same grammar as its siblings (`RailAction`'s rule: the
 *  visible label is a SUBSTRING of the accessible name, WCAG 2.5.3) — the qualifier says what the act IS,
 *  so the control names an object when a rotor reads it out of the rail it sits in. */
function VocabularyDisclosure({
  open,
  hasTags,
  onToggle,
}: {
  readonly open: boolean;
  /** Is there a tag vocabulary behind this door? Only a LOADED, non-empty one says so: the read is gated
   *  (#502 — the disclosure is open, or a tag filter is persisted), so on a cold visit the label stays the
   *  shorter, true-either-way one and the tags join it once the list has arrived. */
  readonly hasTags: boolean;
  readonly onToggle: () => void;
}): ReactElement {
  const closedLabel = hasTags ? CLOSED_DISCLOSURE_LABEL : CLOSED_DISCLOSURE_LABEL_NO_TAGS;
  const openName = hasTags ? "Fewer filters — hide the tag vocabulary" : "Fewer filters — hide the filter options";
  const closedName = hasTags ? `${closedLabel} — show more filters` : `${closedLabel} — show more filters, no tags yet`;
  return <RailAction accessibleName={open ? openName : closedName} expanded={open} label={open ? "Fewer filters" : closedLabel} onClick={onToggle} />;
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
