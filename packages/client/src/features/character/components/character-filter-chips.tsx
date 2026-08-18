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
import type { ButtonProps } from "@orb/ui/button";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Archive, Check, Icon, Minus, Star } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";
import { useEffect, useId, useState } from "react";
import type { TagFilterEntry, TagFilterState } from "#lib";
import { tagFilterStateOf } from "#lib";
import type { LibraryChipTag } from "../lib/character-library-lens.ts";
import { vocabularyPanelTags } from "../lib/character-library-lens.ts";

/** How many tag chips the row shows before the disclosure — one glance, at the 290px pane's width. */
const VISIBLE_TAG_CHIPS = 8;

/** How many panel chips one animation frame mounts. The expansion's whole cost used to land in the click's
 *  own task (648ms blocking, `dispatchDiscreteEvent`); mounting in chunks keeps the FIRST paint to this many
 *  chips and hands every later batch its own frame, so no single task owns the vocabulary. 48 is the widest
 *  batch that stayed inside the 200ms INP budget at the owner's 551-tag library. */
const TAG_CHIP_CHUNK = 48;

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
  /** A shape cue beside the name, so include ⇄ exclude is distinguishable without colour. `off` still
   *  RESERVES the cell (see {@link TagFilterChip}) — it just paints nothing in it. */
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
  readonly availableTags: readonly LibraryChipTag[];
  /** The tag-library read is still in flight — the rail RESERVES the lines the vocabulary will land as,
   *  instead of shoving the character list down when it arrives. */
  readonly vocabularyPending: boolean;
  /** What the pane's live region says about the current lens ("30 of 327 characters"). It renders HERE, in
   *  the datum voice, on the Filters group's own line: floating above the list in the gloss voice it read as
   *  a debug line, and it is the one number this rail's controls produce. */
  readonly resultLabel: string;
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
  onToggleFavorites,
  onToggleArchived,
  onCycleTag,
  onClearFilters,
}: CharacterFilterChipsProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  // Index-based, so the surface's most-used-first order survives; an ACTIVE chip is exempt from the cap.
  const visible = availableTags.filter((tag, at) => at < VISIBLE_TAG_CHIPS || tagFilterStateOf(tagFilter, tag.id) !== "off");
  const hiddenCount = availableTags.length - visible.length;
  const orphans = orphanChips(tagFilter, availableTags);
  // What the group's datum COUNTS: the lenses that narrow the library. `showArchived` is deliberately not
  // one — its ON state WIDENS the set (archived rows shown beside the rest), so counting it would print
  // "1 filter" over a library nothing is filtering (the surface's own `filtersActive` draws the same line).
  const activeCount = tagFilter.length + (favoritesOnly ? 1 : 0);
  return (
    <Section aria-label="Filters" kicker="Filters" kickerLayout="inline" role="group">
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
          else on screen explains, so they are the first thing to find and clear. They stay in the RAIL even
          while the vocabulary is expanded — the panel below is the tag LIBRARY, and by definition an orphan
          is not in it. */}
      {orphans.map((tag) => (
        <TagFilterChip key={tag.id} onCycle={onCycleTag} state={tagFilterStateOf(tagFilter, tag.id)} tag={tag} />
      ))}
      {vocabularyPending ? <VocabularyReserve /> : null}
      {expanded ? null : visible.map((tag) => <TagFilterChip key={tag.id} onCycle={onCycleTag} state={tagFilterStateOf(tagFilter, tag.id)} tag={tag} />)}
      {expanded || hiddenCount === 0 ? null : (
        <RailAction
          accessibleName={`Show ${String(hiddenCount)} more tags`}
          controls={panelId}
          expanded={false}
          label={`+${String(hiddenCount)} more`}
          onClick={(): void => setExpanded(true)}
        />
      )}
      {activeCount > 0 ? <RailAction accessibleName="Clear all filters" label="Clear all" onClick={onClearFilters} /> : null}
      {/* The panel element exists in BOTH states so the collapsed trigger's `aria-controls` resolves to a
          real node; only its contents are conditional. `hidden` (the Tailwind utility, i.e. `display:none`)
          rather than the HTML attribute: the attribute's UA rule loses to the `flex` this Stack sets. */}
      <Stack className={expanded ? "w-full" : "hidden"} gap="tight" id={panelId}>
        {expanded ? (
          <TagVocabularyPanel onCollapse={(): void => setExpanded(false)} onCycle={onCycleTag} panelId={panelId} tagFilter={tagFilter} tags={availableTags} />
        ) : null}
      </Stack>
      {/* THE DATUM LINE — the group's own full-width row, carrying the two numbers this rail produces: what
          the lens matched, and how many lenses are on. It is the group's OUTPUT, so it closes the group.
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
        <Text role="status" voice="datum">
          {resultLabel}
        </Text>
        {activeCount > 0 ? <Text voice="datum">{`${String(activeCount)} active`}</Text> : null}
      </Row>
    </Section>
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

/** The rail's TEXT affordances — the tag-cap disclosure and the clear-all. They are the third register:
 *  neither of them FILTERS anything, so neither wears a filter's edge. `ghost` draws no box at rest at all
 *  (the box appears on hover, where it is an affordance rather than a claim of kinship), which is what
 *  separates them from the outlined pills they sit among now that the pills are actually outlined.
 *
 *  THE ACCESSIBLE NAME IS QUALIFIED, THE VISIBLE ONE IS NOT (side-eye 2026-08-17 ARIA (c)). "Clear all" and
 *  "Show fewer" are complete only in the presence of the rail they sit in; read out of context — which is
 *  exactly how a rotor or a controls list reads them — they name no object. `Clear all filters` /
 *  `Show fewer tags` / `Show N more tags` state the object, and each visible label is a substring of its
 *  accessible name (WCAG 2.5.3), so a voice-control user can still say what they can see.
 *
 *  DEVIATIONS FROM THE APPROVED MOCKUP — the TRUE list (repaired 2026-08-17; the previous ledger claimed
 *  exhaustiveness at two while silently carrying a third):
 *  1. The mockup sets these at `--text-micro` (10.5px, the `gloss` voice). A #102 review already ruled on
 *     that exact shape — "10.5px interactive text was the review's #15 (seven nodes under the readable
 *     floor)", recorded on the `credit` voice in `ui/src/primitives/text/variants.ts` — and these ARE
 *     interactive text. They keep the label step; the absent edge carries the register.
 *  2. They take the `chip` BOX (the rail cell's touch-target height — which is what the mockup gives them
 *     too: `height: var(--spacing-touch-target)`, no border, no fill) rather than the floorless `inline`
 *     size a "no box at all" reading invites. `inline` is exactly what `no-floorless-control-in-wrap`
 *     exists to stop: a full-width 44px hit pseudo on an ~18px text button, repeated inside a `flex-wrap`
 *     rail, is the measured weather-picker collision. A `ghost` box paints nothing at rest anyway, so the
 *     boxless READING costs nothing and the tap target stays real.
 *  3. RESOLVED, was an UNRECORDED deviation: the mockup draws these underlined, and the build dropped the
 *     underline without listing it — which left "+N more" with no resting affordance at all, a muted word
 *     in a rail of muted words with nothing saying it could be pressed (side-eye 2026-08-17 taste (d)). The
 *     underline is back, dotted, so it reads as a disclosure rather than as a link to somewhere else. */
function RailAction({
  label,
  accessibleName,
  expanded,
  controls,
  onClick,
}: {
  readonly label: string;
  /** The qualified name assistive tech hears; the visible `label` is a substring of it. */
  readonly accessibleName: string;
  /** Present on the two DISCLOSURE arms only — a clear-all discloses nothing and must not claim to. */
  readonly expanded?: boolean;
  readonly controls?: string;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <Button
      aria-controls={controls}
      aria-expanded={expanded}
      aria-label={accessibleName}
      className="underline decoration-dotted"
      intent="ghost"
      onClick={onClick}
      size="chip"
      type="button"
    >
      {label}
    </Button>
  );
}

/** THE BOUNDED EXPANSION (side-eye 2026-08-17 P1). Four properties, each answering one measured symptom:
 *
 *  1. BOUNDED — the chips live in a `ScrollArea` whose VIEWPORT carries the cap, so the region shrinks to
 *     its content when the vocabulary is small and scrolls when it is not. (The cap goes on the viewport,
 *     not the root: a percentage/auto root height cannot make `h-full` definite, and the region would clip
 *     instead of scroll.) The character list keeps its own height either way — the CT pins
 *     `[data-slot=virtual-list-scroll]`'s `clientHeight > 0` in the expanded state, because zero is what it
 *     measured before.
 *  2. ITS EXIT IS ABOVE THE SCROLL — "Show fewer tags" sits in the panel's header row, OUTSIDE the
 *     scroller. That is strictly stronger than the sticky-inside-the-scroller shape the review proposed:
 *     it cannot be scrolled away because it never scrolls.
 *  3. IT HAS AN INDEX — 551 entries is a vocabulary, not a list, and the only way to operate one is to
 *     search it. The filter is NAME-substring, case-insensitive, and it is a pure lens function
 *     (`vocabularyPanelTags`) so it is unit-tested without a browser.
 *  4. IT MOUNTS IN CHUNKS — one frame per {@link TAG_CHIP_CHUNK} chips. The click renders the first batch
 *     and yields; every later batch is its own frame. Nothing here is a long task.
 *
 *  Active entries lead the panel (`vocabularyPanelTags`), so the "an active filter is always visible" rule
 *  survives a scroller: the chips that are ON are above the fold, not somewhere in the middle of 551. */
function TagVocabularyPanel({
  tags,
  tagFilter,
  panelId,
  onCycle,
  onCollapse,
}: {
  readonly tags: readonly LibraryChipTag[];
  readonly tagFilter: readonly TagFilterEntry[];
  readonly panelId: string;
  readonly onCycle: (tagId: TagId) => void;
  readonly onCollapse: () => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(TAG_CHIP_CHUNK);
  const matches = vocabularyPanelTags(tags, tagFilter, query);
  // ONE FRAME PER CHUNK. Not a `setTimeout` cascade and not an idle callback: a frame is the unit the INP
  // budget is measured in, and rAF is the one scheduler that is guaranteed to run after the browser has had
  // its turn. The loop ends by itself when everything is mounted (no cleanup-less recursion, no interval).
  useEffect(() => {
    // `0` is not a live handle, and `cancelAnimationFrame(0)` is a documented no-op — which is what keeps
    // this to ONE return path (a conditional early return here is a cleanup the next render does not get).
    const handle = mounted < matches.length ? requestAnimationFrame(() => setMounted((count) => count + TAG_CHIP_CHUNK)) : 0;
    return (): void => cancelAnimationFrame(handle);
  }, [mounted, matches.length]);
  const shown = matches.slice(0, mounted);
  return (
    <>
      <Row gap="field">
        <Input
          aria-label="Filter tags"
          aria-controls={panelId}
          className="min-w-0 flex-1"
          onValueChange={setQuery}
          placeholder="Filter tags…"
          type="search"
          value={query}
        />
        <RailAction accessibleName="Show fewer tags" controls={panelId} expanded={true} label="Show fewer" onClick={onCollapse} />
      </Row>
      {/* `wrapContent` IS LOAD-BEARING, and it took a rendered shot to find it (`done ≠ rendered`):
          ScrollArea's content wrapper measures at `min-width: fit-content` so a horizontally-overflowing
          child can size past the viewport — right for its usual tenant, exactly wrong for a WRAPPING rail,
          which then lays out at max-content and never wraps. Measured without it, live at 290px: 551 chips
          on ONE clipped line behind a horizontal scrollbar, with the vertical cap working perfectly above
          it. (It is a primitive prop, not a `className`: Base UI sets that min-width INLINE, so no class
          short of an `!important` escape can outrank it.)
          The cap goes on the VIEWPORT, not the root: a root whose own height is auto cannot make the
          viewport's `h-full` definite, so the region would CLIP at 192px instead of scrolling. */}
      <ScrollArea viewportClassName="max-h-48" wrapContent={true}>
        {/* `pe-row` is the SCROLLBAR's own width token (`scrollbar: w-row` in the primitive's variants):
            Base UI's scrollbar is positioned over the content, so without the inline-end gutter the last
            chip of every line renders underneath the thumb. */}
        <Row className="flex-wrap pe-row" gap="tight">
          {shown.map((tag) => (
            <TagFilterChip key={tag.id} onCycle={onCycle} state={tagFilterStateOf(tagFilter, tag.id)} tag={tag} />
          ))}
        </Row>
      </ScrollArea>
      {/* A search that finds nothing must SAY so — an empty scroller is indistinguishable from a broken one. */}
      {matches.length === 0 ? <Text voice="gloss">{`No tag matches "${query}".`}</Text> : null}
    </>
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

/** One tri-state tag chip. Its accessible name is `Filter by <tag>: <state> — <what activating does>` — a
 *  screen-reader user hears the state change on every activation AND where the cycle goes next, which is
 *  what makes a cycling control usable at all.
 *
 *  IT TRUNCATES (side-eye 2026-08-03 P1): the server accepts a 72-character tag name, and `Button`'s
 *  `whitespace-nowrap` with no cap turned one into a 475px chip inside a 354px container — with scrollWidth
 *  equal to clientWidth, so nothing was truncating: it simply overflowed and was clipped mid-word. The
 *  cap is the CONTAINER (`max-w-full`), not a magic length, and the label truncates inside it exactly the
 *  way a `ListRow` title does. The `title` carries the full name for a pointer; the accessible NAME already
 *  carried it in full and still does.
 *
 *  ITS WIDTH IS NOT STABLE ACROSS THE CYCLE, AND THAT IS A RULING (side-eye re-pass 2026-08-17 P2, owner
 *  ARM B — a REFUSAL with a receipt, not an oversight). The review asked for a reserved glyph cell so
 *  `off → included` stops growing the chip 16px under the pointer that just pressed it. Built and measured:
 *  an always-rendered `Icon` + its `gap-field` is ~+18px on EVERY resting chip, which at the docked LIST
 *  width (307px) wraps the 8-chip cap onto a third line — the chrome above the first character row went
 *  262.5px → 293.4px against the ratified 264px fence (`RAIL_CHROME_CEILING_PX`, program #102). A scratch
 *  probe reverting ONLY this icon returned the pin to 262.5, so the cell is the whole cause.
 *  The ruling: chrome is the scarce resource on this pane (38.6% of the desktop pane, 43% of the mobile
 *  fold), and 31px of permanent every-visit chrome does not buy the erasure of a 16px input-adjacent nudge
 *  confined to one wrapped line. The finding's WORSE half — the active-count datum mounting into the
 *  control line and shoving the entire rail 18px — is fixed, and for free, above.
 *  THE RECORDED REVISIT ARM, if the feel is flagged again: an OVERLAY glyph (absolutely positioned over the
 *  chip's leading padding, zero layout width). Not built here — it is a new geometry, not a tweak. */
function TagFilterChip({
  tag,
  state,
  onCycle,
}: {
  readonly tag: LibraryChipTag;
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
