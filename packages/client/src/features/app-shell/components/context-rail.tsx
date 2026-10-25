// THE CONTEXT BRACKET'S NAVIGATION — the pane's ONE tab strip (`ContextHeaderTabs`, a real `tablist` seated in the
// header row) and, for a game room, the state rail (`ContextRail`, a named toolbar of cells under the header).
// `context-bracket.tsx` owns the pane's vertical composition; this file owns what a strip and a rail ARE.
//
// THE ARIA MODEL. The header strip is a true `tablist`/`tab` set with roving focus: arrows MOVE focus,
// Enter/Space selects (manual activation — the panels behind these tabs are query-backed surfaces, and arrows
// that selected as they moved mounted every panel on the way). The owner reversed the earlier "named toolbar,
// foot rail" ruling (the strip moved to the header, as ONE tablist per pane). The game state rail is NOT a
// second tab strip: it stays a `toolbar` whose cells carry `aria-current`, and it runs in its OWN `Tabs` root
// so the header's tab map and active-tab indicator only ever see header tabs (Base UI keeps one tab map per
// root, and a state cell registered into the header's root made the bar follow it).
// The viewport panels are `role="region"` named by their tab (the bracket's half of `cellDomId`): a region
// rather than a `tabpanel` because Base UI offloads an inactive `tabpanel`'s children and the bracket keeps a
// visited panel mounted so a revisit is free.

import { Badge } from "@orb/ui/badge";
import { ChevronLeft, ChevronRight, Crown, Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import type { ReactElement, RefObject } from "react";
import { useRef, useSyncExternalStore } from "react";
import type { ResolvedContextTab } from "#lib";
import { cn } from "#lib";
import { cellDomId } from "../lib/context-cell-id.ts";
import type { RailOverflow } from "../lib/context-rail-overflow.ts";
import { NO_OVERFLOW, trackOverflow } from "../lib/context-rail-overflow.ts";

/** THE CELL'S ARIA STRIP — spread onto the cell to DELETE the two attributes the tabs primitive
 *  emits for a tab it no longer is: Base UI merges external props last, and the element under it is a real
 *  `<button>`, so a `role` of `undefined` leaves the native button role. */
const CELL_ARIA_STRIP = { role: undefined, "aria-selected": undefined } as const;

/** The narrow-panel WRAP: below the `xs` container step a rail of exactly six cells lays out as ROWS of three, because
 *  six cells on one `auto-cols-fr` row clipped four captions to ~3 characters (the list's `fold`; a FINE-pointer
 *  answer, a phone stays one row and scrolls). ONLY a rail that folds EVENLY takes it: a five-cell rail would fold 3+2
 *  and leave a ragged void beside the orphan pair. Every other rail SCROLLS instead — `RAIL_TRACK_CLASSES` below keeps
 *  each cell at its whole caption and lets the row overflow. */
const RAIL_WRAP_CELLS = 6;

/** THE READABLE-CAPTION FLOOR, ON EVERY RAIL — the track-sizing function, unconditional.
 *  `minmax(max-content, 1fr)`: the `1fr` MAX keeps the cells equal columns filling the rail whenever there
 *  is slack (the owner ruling against "bitsy buttons bunched left"); the `max-content` MIN refuses to shrink
 *  a cell below its whole caption, so where the cells no longer fit the tracks OVERFLOW and
 *  `overflow-x-auto` scrolls them. Degrade to a scroll, never into an ellipsis. NOT gated on the cell count:
 *  at the narrowest pane even four equal cells clip a caption like "Members". The FOLD stays count-gated
 *  because it answers a different question. */
const RAIL_TRACK_CLASSES = "auto-cols-[minmax(max-content,1fr)] overflow-x-auto";

/** The track's measured overflow, as an external-store subscription (ResizeObserver + scroll are the
 *  store; layout is the state's real owner, so `useSyncExternalStore` is the honest shape — the eslint
 *  no-external-store-subscription remedy, replacing the setState-in-effect this shipped as). The snapshot
 *  CACHES elementwise: a ResizeObserver fires on every layout pass that touches the track — the pane
 *  resizing, a scrollbar appearing, a modal opening over the shell — and a fresh object each time
 *  re-renders the whole rail for a value that did not change (MEASURED: that churn raced the command
 *  palette's focus restore and flaked `app-shell.ct.tsx`). `cellCount` keys the subscribe so a new tab
 *  set re-subscribes and re-measures; every other input arrives through the observer, which is why
 *  nothing else is enumerated. */
function useTrackOverflow(trackRef: RefObject<HTMLDivElement | null>, cellCount: number): RailOverflow {
  const cache = useRef(NO_OVERFLOW);
  // The Compiler memoizes both closures keyed on what they read (no-manual-memo, D54 full-compile):
  // `subscribe` reads `cellCount`, so a new tab set mints a new subscribe and uSES re-subscribes + re-measures.
  const subscribe = (onStoreChange: () => void): (() => void) => {
    void cellCount;
    const track = trackRef.current;
    if (track === null) {
      return (): void => undefined;
    }
    const observer = new ResizeObserver(onStoreChange);
    observer.observe(track);
    track.addEventListener("scroll", onStoreChange, { passive: true });
    return (): void => {
      observer.disconnect();
      track.removeEventListener("scroll", onStoreChange);
    };
  };
  const getSnapshot = (): RailOverflow => {
    const track = trackRef.current;
    const next = track === null ? NO_OVERFLOW : trackOverflow(track);
    const previous = cache.current;
    if (previous.start !== next.start || previous.end !== next.end) {
      cache.current = next;
    }
    return cache.current;
  };
  return useSyncExternalStore(subscribe, getSnapshot, (): RailOverflow => NO_OVERFLOW);
}

export interface ContextRailProps {
  readonly ariaLabel: string;
  readonly tabs: readonly ResolvedContextTab[];
  readonly activeTab: string | null;
  /** Does this rail hold the selection? The owning rail is raised. */
  readonly owns: boolean;
  /** Commit a cell: the pane's one selection seam. */
  readonly onSelect: (id: string) => void;
}

/** The game STATE rail: a named toolbar of equal-column cells under the header strip. Panel content, not a
 *  second tab strip. */
export function ContextRail({ ariaLabel, tabs, activeTab, owns, onSelect }: ContextRailProps): ReactElement {
  const ownership = owns ? "owning" : "receded";
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cellCount = tabs.length;
  const overflow = useTrackOverflow(trackRef, cellCount);

  return (
    <Stack
      data-slot="context-rail"
      data-owns={owns}
      data-overflow-start={overflow.start}
      data-overflow-end={overflow.end}
      className="shrink-0 min-inline-0"
      divider="bottom"
      // The state rail holding the selection wears the raised fill; the receded rail wears the pane's own surface.
      ground={ownership === "owning" ? "raised" : undefined}
    >
      <Row align="center" gap="row" className="relative px-row pbs-field pbe-row min-inline-0">
        {/* Its own root, so the header strip's tab map and indicator never see a state cell. */}
        <Tabs
          value={owns ? activeTab : null}
          onValueChange={(value): void => {
            if (typeof value === "string") {
              onSelect(value);
            }
          }}
          className="gap-0 inline-full min-inline-0"
        >
          <TabsList
            ref={trackRef}
            // `toolbar`, not the primitive's `tablist`: the header strip is the pane's one tablist.
            role="toolbar"
            activateOnFocus={false}
            aria-label={ariaLabel}
            className={cn("grid grid-flow-col gap-tight inline-full min-inline-0", RAIL_TRACK_CLASSES) ?? ""}
            fold={tabs.length === RAIL_WRAP_CELLS}
            rule="none"
          >
            {tabs.map((tab) => (
              <ContextCell key={tab.id} tab={tab} isActive={tab.id === activeTab} ownership={ownership} />
            ))}
          </TabsList>
        </Tabs>
        <OverflowMarks overflow={overflow} fill={ownership === "owning" ? "raised" : "sidebar"} />
      </Row>
    </Stack>
  );
}

/** The overflow marks: a fade plus a chevron on the edge where cells are hidden. Presentational. */
// The fade dissolves into the rail's own fill: the raised step on the owning rail, the sidebar on the receded one.
function OverflowMarks({ overflow, fill }: { readonly overflow: RailOverflow; readonly fill: "raised" | "sidebar" }): ReactElement {
  return (
    <>
      {overflow.start ? (
        <Stack
          align="center"
          justify="center"
          aria-hidden={true}
          data-slot="context-rail-fade"
          data-edge="start"
          className="pointer-events-none absolute inset-y-0 inset-s-0 inline-gutter"
          fade="start"
          fadeFrom={fill}
        >
          <Stack data-slot="context-rail-more">
            <Icon icon={ChevronLeft} size="xs" tone="muted" />
          </Stack>
        </Stack>
      ) : null}
      {overflow.end ? (
        <Stack
          align="center"
          justify="center"
          aria-hidden={true}
          data-slot="context-rail-fade"
          data-edge="end"
          className="pointer-events-none absolute inset-y-0 inset-e-0 inline-gutter"
          fade="end"
          fadeFrom={fill}
        >
          <Stack data-slot="context-rail-more">
            <Icon icon={ChevronRight} size="xs" tone="muted" />
          </Stack>
        </Stack>
      ) : null}
    </>
  );
}

/** THE PANE'S TAB STRIP — a real tablist in the header row. Overflow scrolls inside the strip (no native
 *  scrollbar; the fade and chevron say there is more). The strip stretches to the row's height so the active
 *  bar rides the header's own divider. */
export function ContextHeaderTabs({
  ariaLabel,
  paneLabel,
  tabs,
  activeTab,
}: {
  readonly ariaLabel: string;
  /** What a single-tab header prints: the pane's own name, where the tablist's name is the section's. */
  readonly paneLabel?: string | undefined;
  readonly tabs: readonly ResolvedContextTab[];
  readonly activeTab: string | null;
}): ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const overflow = useTrackOverflow(trackRef, tabs.length);
  // One tab is not a strip: with nothing to choose between, the header names the PANE in the tabs' own type
  // (a plain heading, no tablist) beside the trailing controls, and the bracket's panel names the tab.
  if (tabs.length <= 1) {
    return (
      <Row data-slot="context-tab-strip" align="center" className="flex-1 self-stretch px-block min-inline-0">
        <Text as="span" voice="label" data-slot="context-header-title" className="truncate min-inline-0">
          {paneLabel ?? ariaLabel}
        </Text>
      </Row>
    );
  }
  return (
    <Row
      data-slot="context-tab-strip"
      data-overflow-start={overflow.start}
      data-overflow-end={overflow.end}
      className="relative flex-1 self-stretch min-inline-0"
    >
      <TabsList
        ref={trackRef}
        activateOnFocus={false}
        aria-label={ariaLabel}
        className="shell-context-tab-strip flex-nowrap overflow-x-auto px-row block-full inline-full min-inline-0"
        rule="none"
      >
        {tabs.map((tab) => (
          <ContextTab key={tab.id} tab={tab} isActive={tab.id === activeTab} />
        ))}
        <TabsIndicator />
      </TabsList>
      <OverflowMarks overflow={overflow} fill="sidebar" />
    </Row>
  );
}

function ContextTab({ tab, isActive }: { readonly tab: ResolvedContextTab; readonly isActive: boolean }): ReactElement {
  const locked = tab.disabledReason !== null;
  const count = typeof tab.badge === "number" ? tab.badge : 0;
  return (
    <TabsTab
      value={tab.id}
      id={cellDomId(tab.id)}
      // The lock is in the name (Base UI emits `aria-disabled="false"` here, so a glyph-only lock was
      // imperceptible to AT); the visible caption stays the prefix of the accessible name.
      aria-label={locked ? `${tab.label} \u2014 locked` : tab.label}
      data-crown={tab.crown}
      className="shrink-0"
    >
      {renderCellIcon(tab, isActive, locked)}
      <Text as="span" voice="label" data-slot="context-cell-caption" className="truncate" ink="inherit">
        {tab.label}
      </Text>
      {locked ? <Icon icon={Lock} size="xs" aria-hidden={true} tone="muted" receded={true} /> : null}
      {locked ? null : <ContextTabBadge count={count} dot={tab.badge === true} />}
    </TabsTab>
  );
}

function ContextTabBadge({ count, dot }: { readonly count: number; readonly dot: boolean }): ReactElement | null {
  if (count > 0) {
    return (
      <Badge intent="primary" size="sm" aria-hidden={true}>
        {count}
      </Badge>
    );
  }
  return dot ? <Badge intent="primary" size="dot" aria-hidden={true} /> : null;
}

/** One cell: glyph + caption, ALWAYS both — `layout="stacked"`, the primitive's OWN arm for a cell
 *  whose height follows its content. The caption is the accessible name AND visible; `title` is NOT the
 *  caption's understudy (the word is on screen and `aria-label` carries the full name when it truncates).
 *
 *  ACTIVE: the ember fill + foreground ink + the 2px primary bar on the bottom edge (the mock's `.cell.on`).
 *  PHASE-locked (the Map): a LOCK glyph and "locked" in the name — deliberately NOT `aria-disabled`: the
 *  locked cell OPENS onto a body that states the reason and when the feature arrives, and a control announcing
 *  "unavailable" while Enter opens it is two stories. One story, in every pane: a real cell wearing a lock,
 *  where mouse, keyboard and AT all get the same answer.
 *
 *  AND THE DIM OBEYS THAT SAME STORY. The mock's `.cell.lock { opacity: 0.6 }` on the cell ROOT would put the
 *  caption under contrast — and because this cell renounces `aria-disabled`, 1.4.3's disabled exemption does
 *  not apply to it. (axe does not composite ancestor `opacity`, so it cannot catch this.) The dim lands on the
 *  ORNAMENTS — the glyph and the padlock, non-text content — and the CAPTION keeps the rail's own ink, so
 *  the "unavailable" signal is carried by the lock, which is the thing that means it. */
function ContextCell({
  tab,
  isActive,
  ownership,
}: {
  readonly tab: ResolvedContextTab;
  readonly isActive: boolean;
  readonly ownership: "owning" | "receded";
}): ReactElement {
  const locked = tab.disabledReason !== null;
  const count = typeof tab.badge === "number" ? tab.badge : 0;
  return (
    <TabsTab
      // The rail cell owns the selected tint, the bar on its bottom edge and the coarse floor (the large control
      // step, the first at or above the mock's 52px cells).
      layout="cell"
      quiet={ownership === "receded"}
      value={tab.id}
      id={cellDomId(tab.id)}
      // THE CELL IS A BUTTON, NOT A TAB (the ARIA-model note in the header). The strip deletes
      // `role`/`aria-selected`, and `aria-current` carries the same fact honestly — ABSENT on every cell of
      // the rail that is not holding the view.
      {...CELL_ARIA_STRIP}
      aria-current={isActive ? true : undefined}
      // THE LOCK IS IN THE NAME: Base UI emits `aria-disabled="false"` on this cell (it is genuinely not
      // disabled), so a glyph-only lock would be one AT could not perceive. The visible
      // caption stays the prefix of the accessible name (WCAG 2.5.3 Label-in-Name).
      aria-label={locked ? `${tab.label} — locked` : tab.label}
      data-crown={tab.crown}
      // NO `min-w-0` HERE, EVER: with the spacing scale registered in tailwind-merge a call-site `min-w-0` wins
      // outright and deletes the touch floor the primitive's `min-w-touch-target` carries.
      className="relative"
    >
      {renderCellIcon(tab, isActive, locked)}
      {/* voice=LABEL, not `gloss`: this caption is the pane's PRIMARY NAVIGATION, and `gloss` is
          the 10.5px `micro` step — under the 11px readable floor. The mock draws its captions at 10.5px and is
          NOT followed on this axis: the readable-floor ruling stands. text-inherit so the cell's own state
          colour still wins. */}
      <Text as="span" voice="label" data-slot="context-cell-caption" className="truncate max-inline-full" ink="inherit">
        {tab.label}
      </Text>
      {/* THE CORNER ORNAMENTS SIT ONE `field` OFF THE CELL'S OWN CORNER: the rail is full-bleed, so the LAST
          cell's inline-end edge IS the pane's edge and a flush glyph reads as clipped.
          LOGICAL (`end-*`), never `right-*`. Spelled as a whole literal at each site (not hoisted) because
          `ui-size-via-variant` reads these class strings statically. */}
      {locked ? <Icon icon={Lock} size="xs" aria-hidden={true} className="absolute inset-e-field inset-bs-field" tone="muted" receded={true} /> : null}
      {locked || isActive ? null : <ContextCellBadge count={count} dot={tab.badge === true} />}
    </TabsTab>
  );
}

function renderCellIcon(tab: ResolvedContextTab, isActive: boolean, locked: boolean): ReactElement | null {
  if (tab.icon === undefined) {
    return null;
  }
  if (tab.icon === Crown) {
    return <Icon icon={Crown} size="sm" fill={isActive ? "solid" : "none"} receded={locked} />;
  }
  return <Icon icon={tab.icon} size="sm" receded={locked} />;
}

function ContextCellBadge({ count, dot }: { readonly count: number; readonly dot: boolean }): ReactElement | null {
  if (count > 0) {
    return (
      <Badge intent="primary" size="sm" aria-hidden={true} className="absolute inset-e-field inset-bs-field">
        {count}
      </Badge>
    );
  }
  // The childless dot is Badge's `size="dot"` arm — why this call site and why that size is at that arm's own
  // header, `@orb/ui/badge/variants.ts`, one home.
  return dot ? <Badge intent="primary" size="dot" aria-hidden={true} className="absolute inset-e-field inset-bs-field" /> : null;
}
