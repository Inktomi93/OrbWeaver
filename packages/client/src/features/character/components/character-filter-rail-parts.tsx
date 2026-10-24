// The library filter rail's PARTS — its text affordance, its tri-state tag chip, and the bounded
// expansion that shows the whole tag vocabulary. The rail composes WHICH of these are on screen, and this
// owns what each one IS. It is the rail's own module — no other consumer.

import type { TagId } from "@orb/kit/ids";
import type { ButtonProps } from "@orb/ui/button";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Check, Icon, Minus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row } from "@orb/ui/layout";
import { RECEDED_INK } from "@orb/ui/lib";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { EditableTagChip, SHOW_ONLY_AT_COARSE } from "#components";
import type { TagFilterEntry, TagFilterState } from "#lib";
import { cn, tagFilterStateOf } from "#lib";
import { useRovingChipFocus } from "../hooks/use-roving-chip-focus.ts";

import type { LibraryChipTag } from "../lib/character-library-lens.ts";
import { vocabularyPanelTags } from "../lib/character-library-lens.ts";

/** THE tag chip's own spelling — the state attribute each chip carries, which is also what the CTs address
 *  them by. One const, so the roving group and the markup can never name two different things. */
const TAG_CHIP_SELECTOR = "[data-tag-filter-state]";
const EDIT_LABEL_KEY = "F2";

/** The expansion mounts chips in frame-sized chunks so the first paint stays bounded and later batches run
 *  in separate tasks. This is a rendering budget, not a limit on the available vocabulary.
 */
const TAG_CHIP_CHUNK = 48;

/** How one chip STATE presents itself. One interface + one total Record = a fourth state is a tsc error
 *  here, not a chip that renders as "off" and filters as something else. */
interface TagChipPresentation {
  /** The state word inside the chip's accessible name — the ONLY place the state is announced. */
  readonly announced: string;
  /** What ACTIVATING does from here — the second half of the accessible name, so the cycle is discoverable
   *  without operating it blind. */
  readonly next: string;
  /** The primitive's own selection layer (the selected fill, and the ring plus strike on the exclusion
   *  arm). DERIVED from `Button`, never re-spelled: a hand-written `className` of ring utilities would be a skin
   *  decided in a feature, and the chips would read as a different class of thing from the scope toggles
   *  they sit beside. */
  readonly selection: NonNullable<ButtonProps["selection"]>;
  /** A shape cue beside the name, so include ⇄ exclude is distinguishable without colour. `off` still
   *  RESERVES the cell (see {@link TagFilterChip}) — it just paints nothing in it. */
  readonly icon: LucideIcon | null;
  /** THE RESTING INK, DECLARED BY THE RAIL RATHER THAN BY THE PRIMITIVE. Two rulings meet here. The rail
   *  carries THREE registers, and a filter chip "recedes to muted" against the command's foreground. And
   *  "Transparent `Button` actions inherit their host surface's paired ink; they do not substitute the
   *  low-emphasis `muted-foreground` semantic for an action label", so the transparent intents paint
   *  `text-current`, which alone would collapse two of the rail's registers onto one ink. BOTH RULINGS
   *  SURVIVE: the primitive keeps inheriting, and the HOST — this rail, where the register law lives — states
   *  the receding ink for the vocabulary it holds. Only the `off` arm carries it: an ON/NEGATED chip is
   *  wearing the selection layer's own fill-and-ink pairing, and a call-site ink would
   *  win the merge and erase exactly the muted-vs-selected reading {@link TagFilterChip} depends on. */
  readonly restingInk: string | undefined;
}

const TAG_CHIP_PRESENTATION: Record<TagFilterState, TagChipPresentation> = {
  off: { announced: "off", next: "activate to include", selection: "none", icon: null, restingInk: RECEDED_INK },
  include: { announced: "included", next: "activate to exclude", selection: "on", icon: Check, restingInk: undefined },
  exclude: { announced: "excluded", next: "activate to clear", selection: "negated", icon: Minus, restingInk: undefined },
};

/** THE BOUNDED EXPANSION. Four properties, each answering one symptom:
 *
 *  1. BOUNDED — the chips live in a `ScrollArea` whose VIEWPORT carries the cap, so the region shrinks to
 *     its content when the vocabulary is small and scrolls when it is not. (The cap goes on the viewport,
 *     not the root: a percentage/auto root height cannot make `h-full` definite, and the region would clip
 *     instead of scroll.) The character list keeps its own height either way — the CT pins
 *     `[data-slot=virtual-list-scroll]`'s `clientHeight > 0` in the expanded state, because an unbounded panel
 *     collapses it to zero.
 *  2. ITS EXIT IS ABOVE THE SCROLL — "Show fewer tags" sits in the panel's header row, OUTSIDE the
 *     scroller. That is strictly stronger than a sticky control inside the scroller: it cannot be
 *     scrolled away because it never scrolls.
 *  3. IT HAS AN INDEX — hundreds of entries are a vocabulary, not a list, and the only way to operate one is to
 *     search it. The filter is NAME-substring, case-insensitive, and it is a pure lens function
 *     (`vocabularyPanelTags`) so it is unit-tested without a browser.
 *  4. IT MOUNTS IN CHUNKS — one frame per {@link TAG_CHIP_CHUNK} chips. The click renders the first batch
 *     and yields; every later batch is its own frame. Nothing here is a long task.
 *
 *  Active entries lead the panel (`vocabularyPanelTags`), so the "an active filter is always visible" rule
 *  survives a scroller: the chips that are ON are above the fold, not somewhere in the middle. */
export function TagVocabularyPanel({
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
  // ONE TAB STOP FOR THE CLOUD — see `use-roving-chip-focus.ts` for the tab-stop cost and for why this borrows the toolbar KEYBOARD MODEL without the toolbar's skin.
  const roving = useRovingChipFocus(shown.length, TAG_CHIP_SELECTOR);
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
      {/* THE VIEWPORT IS A NAMED REGION. Base UI makes an overflowing viewport
          `tabindex=0`, and correctly so — a scroll region a keyboard user cannot reach is a trap — but an
          unnamed one announces as a bare generic between "Show fewer tags" and the tag toolbar, i.e. a stop
          on the way to the chips that says nothing about itself. `role="region"` + a name is the smaller of
          the two honest answers; the other (folding the tab stop onto the toolbar) would be a lie, because
          the SCROLLER is the thing that scrolls. The name is deliberately not the toolbar's
          ("Tag filter vocabulary"): a region and the toolbar inside it announcing the same words is the
          host-duplicates-its-body defect one pane over. */}
      <ScrollArea viewportClassName="max-h-48" viewportProps={{ role: "region", "aria-label": "Tag vocabulary" }} wrapContent={true}>
        {/* `pe-row` is the SCROLLBAR's own width token (`scrollbar: w-row` in the primitive's variants):
            Base UI's scrollbar is positioned over the content, so without the inline-end gutter the last
            chip of every line renders underneath the thumb. */}
        {/* `role="toolbar"` is what makes the roving stop legible to AT: it announces a GROUP of controls
            with its own arrow-key model, so a screen-reader user is told the cloud is one thing before
            they land in it. `aria-orientation="horizontal"` is the honest answer for a wrapping rail —
            both axes walk the same linear order (see the hook). */}
        <Row
          aria-label="Tag filter vocabulary"
          aria-orientation="horizontal"
          className="flex-wrap pe-row"
          gap="tight"
          onFocus={roving.onFocus}
          onKeyDown={roving.onKeyDown}
          role="toolbar"
        >
          {shown.map((tag, at) => (
            <TagFilterChip key={tag.id} onCycle={onCycle} state={tagFilterStateOf(tagFilter, tag.id)} tabIndex={at === roving.activeIndex ? 0 : -1} tag={tag} />
          ))}
        </Row>
      </ScrollArea>
      {/* A search that finds nothing must SAY so — an empty scroller is indistinguishable from a broken one. */}
      <Text voice="gloss">{`Right-click, hold, or press ${EDIT_LABEL_KEY} to edit a label.`}</Text>
      {matches.length === 0 ? <Text voice="gloss">{`No tag matches "${query}".`}</Text> : null}
    </>
  );
}

/** One tri-state tag chip. Its accessible name is `Filter by <tag>: <state> — <what activating does>` — a
 *  screen-reader user hears the state change on every activation AND where the cycle goes next, which is
 *  what makes a cycling control usable at all.
 *
 *  IT TRUNCATES: the server accepts a long tag name, and `Button`'s `whitespace-nowrap` with no cap would
 *  overflow the container and clip mid-word. The cap is the CONTAINER (`max-w-full`), not a magic length,
 *  and the label truncates inside it exactly the way a `ListRow` title does. The accessible NAME carries the
 *  full tag name.
 *
 *  ITS WIDTH IS NOT STABLE ACROSS THE CYCLE, AND THAT IS AN OWNER RULING. A reserved glyph cell would stop
 *  `off → included` growing the chip under the pointer, but it costs width on EVERY resting chip, which at
 *  the docked LIST width wraps the chip cap onto another line and breaks the rail's chrome ceiling
 *  (`RAIL_CHROME_CEILING_PX`). Chrome is the scarce resource on this pane, and permanent every-visit chrome
 *  does not buy the erasure of a small input-adjacent nudge confined to one wrapped line.
 *  THE RECORDED REVISIT ARM, if the feel is flagged again: an OVERLAY glyph (absolutely positioned over the
 *  chip's leading padding, zero layout width). Not built here — it is a new geometry, not a tweak. */
export function TagFilterChip({
  tag,
  state,
  tabIndex,
  onCycle,
}: {
  readonly tag: LibraryChipTag;
  readonly state: TagFilterState;
  /** `-1` for every chip but one inside the vocabulary panel's roving group. Absent in the RAIL,
   *  where the handful of chips are ordinary tab stops. */
  readonly tabIndex?: 0 | -1;
  readonly onCycle: (tagId: TagId) => void;
}): ReactElement {
  const presentation = TAG_CHIP_PRESENTATION[state];
  return (
    // iOS WebKit fires no `contextmenu` on long-press, so touch gets a visible edit button beside the chip.
    // Fine pointers keep right-click and F2 and the rail's resting width.
    <Row className="min-w-0 max-w-full" gap="tight">
      <TagFilterChipButton onCycle={onCycle} presentation={presentation} state={state} tabIndex={tabIndex} tag={tag} />
      <span className={SHOW_ONLY_AT_COARSE}>
        <EditableTagChip iconOnly={true} tag={tag} />
      </span>
    </Row>
  );
}

function TagFilterChipButton({
  tag,
  state,
  presentation,
  tabIndex,
  onCycle,
}: {
  readonly tag: LibraryChipTag;
  readonly state: TagFilterState;
  readonly presentation: TagChipPresentation;
  readonly tabIndex: 0 | -1 | undefined;
  readonly onCycle: (tagId: TagId) => void;
}): ReactElement {
  return (
    <EditableTagChip
      tag={tag}
      trigger={(edit): ReactElement => (
        <Button
          aria-keyshortcuts={EDIT_LABEL_KEY}
          onKeyDown={(event): void => {
            if (event.key === EDIT_LABEL_KEY) {
              event.preventDefault();
              edit();
            }
          }}
          onContextMenu={(event): void => {
            event.preventDefault();
            edit();
          }}
          aria-label={`Filter by ${tag.name}: ${presentation.announced} — ${presentation.next}`}
          // `?? ""` because `cn`'s type admits `undefined` (clsx's) while `ButtonProps.className` does not under
          // `exactOptionalPropertyTypes` — the same idiom message-row-variants.ts homes as its `cx`.
          className={cn("min-w-0 max-w-full", presentation.restingInk) ?? ""}
          data-tag-filter-state={state}
          intent="outline"
          onClick={(): void => onCycle(tag.id)}
          selection={presentation.selection}
          shape="pill"
          size="chip"
          {...(tabIndex === undefined ? {} : { tabIndex })}
          type="button"
        >
          {presentation.icon === null ? null : <Icon icon={presentation.icon} size="xs" />}
          {/* `text-inherit` is required: `voice="label"` matches the `chip` box's own type step but would
          also repaint the ink `text-foreground`, erasing the muted-vs-selected reading that tells an off
          chip from an on one at rest. The chip's intent + selection own the colour; this span owns only
          the clip. */}
          <Text as="span" className="min-w-0 truncate text-inherit" voice="label">
            {tag.name}
          </Text>
        </Button>
      )}
    />
  );
}

/** The rail's TEXT affordances — the tag-cap disclosure and the clear-all. They are the third register:
 *  neither of them FILTERS anything, so neither wears a filter's edge. `ghost` draws no box at rest at all
 *  (the box appears on hover, where it is an affordance rather than a claim of kinship), which is what
 *  separates them from the outlined pills they sit among now that the pills are actually outlined.
 *
 *  THE ACCESSIBLE NAME IS QUALIFIED, THE VISIBLE ONE IS NOT. "Clear all" and
 *  "Show fewer" are complete only in the presence of the rail they sit in; read out of context — which is
 *  exactly how a rotor or a controls list reads them — they name no object. `Clear all filters` /
 *  `Show fewer tags` / `Show N more tags` state the object, and each visible label is a substring of its
 *  accessible name (WCAG 2.5.3), so a voice-control user can still say what they can see.
 *
 *  DEVIATIONS FROM THE APPROVED MOCKUP — the complete list:
 *  1. The mockup sets these at `--text-micro` (the `gloss` voice), which is under the readable floor for
 *     interactive text (the `credit` voice's note in `ui/src/primitives/text/variants.ts`), and these ARE
 *     interactive text. They keep the label step; the absent edge carries the register.
 *  2. They take the `chip` BOX (the rail cell's touch-target height — which is what the mockup gives them
 *     too: `height: var(--spacing-touch-target)`, no border, no fill) rather than the floorless `inline`
 *     size a "no box at all" reading invites. `inline` is exactly what `no-floorless-control-in-wrap`
 *     exists to stop: a full-width 44px hit pseudo on an ~18px text button, repeated inside a `flex-wrap`
 *     rail, collides with its neighbours' targets. A `ghost` box paints nothing at rest anyway, so the
 *     boxless READING costs nothing and the tap target stays real.
 *  3. The mockup's underline is dotted here: without it "+N more" has no resting affordance at all, a muted
 *     word in a rail of muted words, and a dotted line reads as a disclosure rather than as a link. */
export function RailAction({
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
      // The receding ink is the RAIL's to state, not `ghost`'s — see {@link TagChipPresentation.restingInk}
      // for the two rulings this reconciles. This affordance has no selected arm, so it carries it flat.
      className={`${RECEDED_INK} underline decoration-dotted`}
      intent="ghost"
      onClick={onClick}
      size="chip"
      type="button"
    >
      {label}
    </Button>
  );
}
