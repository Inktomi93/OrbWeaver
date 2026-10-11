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
import { CONTEXT_CELL_FLOOR_AT_COARSE, CONTEXT_RAIL_WRAP, CONTEXT_RAIL_WRAPPED_EDGE_BAR_OFF } from "#components";
import type { ResolvedContextTab } from "#lib";
import { cellDomId } from "../lib/context-cell-id.ts";
import type { RailOverflow } from "../lib/context-rail-overflow.ts";
import { NO_OVERFLOW, trackOverflow } from "../lib/context-rail-overflow.ts";

/** THE CELL'S ARIA STRIP (#112) — spread onto the cell to DELETE the two attributes the tabs primitive
 *  emits for a tab it no longer is: Base UI merges external props last, and the element under it is a real
 *  `<button>`, so a `role` of `undefined` leaves the native button role. */
const CELL_ARIA_STRIP = { role: undefined, "aria-selected": undefined } as const;

/** The active bar sits on the state-rail cell's BOTTOM edge, the seam with the viewport it selects.
 *
 *  "ONE ROW" IS A CLAIM, so the bar stands down in the state where it stops holding:
 *  `CONTEXT_RAIL_WRAPPED_EDGE_BAR_OFF` (its own note carries the 272px measurement and the mechanism).
 *  In the wrapped arm a first-row cell's bottom edge is the seam above row TWO. */
const CELL_EDGE_CLASSES = `border-b-2 border-transparent data-active:border-primary ${CONTEXT_RAIL_WRAPPED_EDGE_BAR_OFF}`;

/** The state rail holding the selection wears the raised fill; the receded rail wears nothing (the pane's own
 *  surface). The step is small by the palette's own values — the fill and the ember active cell carry it. */
const RAIL_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "bg-surface-raised",
  receded: "",
};
/** A resting cell is the muted step and only the ACTIVE cell lifts to the foreground; the receded rail's cells
 *  step quieter. The step is floored by WCAG 1.4.3 (4.5:1 in both polarities), not by taste: these captions
 *  are live navigation with no disabled exemption. */
const CELL_OWNERSHIP_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "",
  receded: "text-muted-foreground/90",
};
/** The narrow-panel WRAP: below the `xs` container step a rail of exactly six cells lays out as ROWS of three, because
 *  six cells on one `auto-cols-fr` row clipped four captions to ~3 characters (`CONTEXT_RAIL_WRAP`; a FINE-pointer
 *  answer, a phone stays one row and scrolls). ONLY a rail that folds EVENLY takes it: a five-cell rail would fold 3+2
 *  and leave a ragged void beside the orphan pair. Every other rail SCROLLS instead — `RAIL_TRACK_CLASSES` below keeps
 *  each cell at its whole caption and lets the row overflow. */
const RAIL_WRAP_CELLS = 6;

/** THE READABLE-CAPTION FLOOR, ON EVERY RAIL (#208, 2026-08-18) — the track-sizing function, unconditional.
 *  `minmax(max-content, 1fr)`: the `1fr` MAX keeps the cells equal columns filling the rail whenever there
 *  is slack (the 2026-07-28 owner ruling against "bitsy buttons bunched left"); the `max-content` MIN
 *  refuses to shrink a cell below its whole caption, so where the cells no longer fit the tracks OVERFLOW
 *  and `overflow-x-auto` scrolls them. Degrade to a scroll, never into an ellipsis. NOT gated on the cell
 *  count: MEASURED at the 272px floor the chat rail's four `auto-cols-fr` cells were 51px each against a
 *  58px "Members", and both clipped. The FOLD stays count-gated because it answers a different question. */
const RAIL_TRACK_CLASSES = "auto-cols-[minmax(max-content,1fr)] overflow-x-auto";

/** THE SCROLL HAS TO SAY IT IS A SCROLL (#875 F7/F8, side-eye 2026-08-30). `RAIL_TRACK_CLASSES` degrades an
 *  over-long rail to a scroll rather than an ellipsis, and `RAIL_WRAP_CELLS` folds only a rail that folds
 *  EVENLY — both correct, and together they left the case nothing answered: a five-cell rail at 1024×768
 *  (`scrollWidth 316` vs `clientWidth 290`) painted "Acti" cut at the pane's edge with no ellipsis, no
 *  scrollbar and no fade. That is the [[count-gate-standing-in-for-fit]] shape one level up: the FOLD is
 *  count-gated (right) and nothing measured the FIT.
 *
 *  So the fit is measured, in the only place it can be — the live box — and the overflowing edge wears a
 *  fade. Not a permanent fade (it would veil the last caption of every rail that fits) and not an
 *  always-on scrollbar (it would spend a row of height on every pane at every width): a `ResizeObserver` +
 *  a passive scroll listener write `data-overflow-start`/`data-overflow-end` on the rail, and the fades key
 *  off those. The attributes are the CT's handle as well as the paint's. */
const RAIL_FADE_CLASSES: Readonly<Record<"owning" | "receded", string>> = {
  owning: "from-surface-raised",
  receded: "from-sidebar",
};

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
      className={`min-w-0 shrink-0 border-border border-b ${RAIL_OWNERSHIP_CLASSES[ownership]}`}
    >
      <Row align="center" gap="row" className="relative min-w-0 px-row pt-field pb-row">
        {/* Its own root, so the header strip's tab map and indicator never see a state cell. */}
        <Tabs
          value={owns ? activeTab : null}
          onValueChange={(value): void => {
            if (typeof value === "string") {
              onSelect(value);
            }
          }}
          className="min-w-0 w-full gap-0"
        >
          <TabsList
            ref={trackRef}
            // `toolbar`, not the primitive's `tablist`: the header strip is the pane's one tablist.
            role="toolbar"
            activateOnFocus={false}
            aria-label={ariaLabel}
            className={`grid min-w-0 w-full ${RAIL_TRACK_CLASSES} grid-flow-col gap-tight ${tabs.length === RAIL_WRAP_CELLS ? CONTEXT_RAIL_WRAP : ""} border-y-0`}
          >
            {tabs.map((tab) => (
              <ContextCell key={tab.id} tab={tab} isActive={tab.id === activeTab} ownership={ownership} />
            ))}
          </TabsList>
        </Tabs>
        <OverflowMarks overflow={overflow} fill={RAIL_FADE_CLASSES[ownership]} />
      </Row>
    </Stack>
  );
}

/** The overflow marks: a fade plus a chevron on the edge where cells are hidden. Presentational. */
function OverflowMarks({ overflow, fill }: { readonly overflow: RailOverflow; readonly fill: string }): ReactElement {
  return (
    <>
      {overflow.start ? (
        <Stack
          align="center"
          justify="center"
          aria-hidden={true}
          data-slot="context-rail-fade"
          data-edge="start"
          className={`pointer-events-none absolute inset-y-0 start-0 w-gutter bg-linear-to-r ${fill} via-60% to-transparent`}
        >
          <Stack data-slot="context-rail-more" className="text-muted-foreground">
            <Icon icon={ChevronLeft} size="xs" />
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
          className={`pointer-events-none absolute inset-y-0 end-0 w-gutter bg-linear-to-l ${fill} via-60% to-transparent`}
        >
          <Stack data-slot="context-rail-more" className="text-muted-foreground">
            <Icon icon={ChevronRight} size="xs" />
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
  tabs,
  activeTab,
}: {
  readonly ariaLabel: string;
  readonly tabs: readonly ResolvedContextTab[];
  readonly activeTab: string | null;
}): ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const overflow = useTrackOverflow(trackRef, tabs.length);
  // One tab is not a strip: with nothing to choose between, the header names the view in the tabs' own type
  // (a plain heading, no tablist) beside the trailing controls, and the bracket's panel names itself.
  if (tabs.length <= 1) {
    return (
      <Row data-slot="context-tab-strip" align="center" className="min-w-0 flex-1 self-stretch px-block">
        <Text as="span" voice="label" data-slot="context-header-title" className="min-w-0 truncate">
          {tabs[0]?.label ?? ariaLabel}
        </Text>
      </Row>
    );
  }
  return (
    <Row data-slot="context-tab-strip" data-overflow-start={overflow.start} data-overflow-end={overflow.end} className="relative min-w-0 flex-1 self-stretch">
      <TabsList
        ref={trackRef}
        activateOnFocus={false}
        aria-label={ariaLabel}
        className="shell-context-tab-strip h-full min-w-0 w-full flex-nowrap overflow-x-auto border-b-0 px-row"
      >
        {tabs.map((tab) => (
          <ContextTab key={tab.id} tab={tab} isActive={tab.id === activeTab} />
        ))}
        <TabsIndicator />
      </TabsList>
      <OverflowMarks overflow={overflow} fill="from-sidebar" />
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
      {...(tab.disabledReason !== null ? { title: tab.disabledReason } : {})}
    >
      {renderCellIcon(tab, isActive, locked)}
      <Text as="span" voice="label" data-slot="context-cell-caption" className="truncate text-inherit">
        {tab.label}
      </Text>
      {locked ? <Icon icon={Lock} size="xs" aria-hidden={true} className="text-muted-foreground opacity-60" /> : null}
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

/** One cell: glyph + caption, ALWAYS both (#208) — `layout="stacked"`, the primitive's OWN arm for a cell
 *  whose height follows its content. The caption is the accessible name AND visible; `title` is NOT the
 *  caption's understudy (the word is on screen and `aria-label` carries the full name when it truncates).
 *
 *  ACTIVE: the ember fill + foreground ink + the 2px primary bar on the bottom edge (the mock's `.cell.on`).
 *  PHASE-locked (the Map): a LOCK glyph + the reason on `title` — deliberately NOT `aria-disabled`: the
 *  locked cell OPENS onto a body that states when the feature arrives (RV-7), and a control announcing
 *  "unavailable" while Enter opens it is two stories. One story, in every pane: a real cell wearing a lock,
 *  where mouse, keyboard and AT all get the same answer.
 *
 *  AND THE DIM OBEYS THAT SAME STORY (#874, side-eye 2026-08-30 — the one WCAG failure in the bracket).
 *  The mock's `.cell.lock { opacity: 0.6 }` was taken literally onto the cell ROOT, which put the caption
 *  at **3.54:1** against a sibling's 7.59:1 — and because this cell renounces `aria-disabled`, 1.4.3's
 *  disabled exemption does not apply to it. (axe scored it 100: it does not composite ancestor `opacity`,
 *  so it read the undimmed ink. The green was a blind spot, not a clearance.) The dim now lands on the
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
      layout="stacked"
      value={tab.id}
      id={cellDomId(tab.id)}
      // THE CELL IS A BUTTON, NOT A TAB (#112 — the ARIA-model note in the header). The strip deletes
      // `role`/`aria-selected`, and `aria-current` carries the same fact honestly — ABSENT on every cell of
      // the rail that is not holding the view.
      {...CELL_ARIA_STRIP}
      aria-current={isActive ? true : undefined}
      // THE LOCK IS IN THE NAME (side-eye 2026-08-06 ARIA): Base UI emits `aria-disabled="false"` on this
      // cell (it is genuinely not disabled), so a glyph-only lock was one AT could not perceive. The visible
      // caption stays the prefix of the accessible name (WCAG 2.5.3 Label-in-Name).
      aria-label={locked ? `${tab.label} — locked` : tab.label}
      data-crown={tab.crown}
      // NO `min-w-0` HERE, EVER (#146): with the spacing scale registered in tailwind-merge a call-site
      // `min-w-0` wins outright and deletes the ≥44px floor the primitive's `min-w-touch-target` carries
      // (MEASURED at 320 coarse: the cells fell to 39px). The coarse HEIGHT floor is the bracket's own:
      // `CONTEXT_CELL_FLOOR_AT_COARSE` (56px — the first token step at or above the mock's 52px cells).
      className={`relative data-active:bg-primary/15 data-active:text-foreground ${CELL_EDGE_CLASSES} ${CELL_OWNERSHIP_CLASSES[ownership]} ${CONTEXT_CELL_FLOOR_AT_COARSE}`}
      {...(tab.disabledReason !== null ? { title: tab.disabledReason } : {})}
    >
      {renderCellIcon(tab, isActive, locked)}
      {/* voice=LABEL, not `gloss` (side-eye #102): this caption is the pane's PRIMARY NAVIGATION, and `gloss` is
          the 10.5px `micro` step — under the 11px readable floor. The mock draws its captions at 10.5px and is
          NOT followed on this axis: the readable-floor ruling stands. text-inherit so the cell's own state
          colour still wins. */}
      <Text as="span" voice="label" data-slot="context-cell-caption" className="max-w-full truncate text-inherit">
        {tab.label}
      </Text>
      {/* THE CORNER ORNAMENTS SIT ONE `field` OFF THE CELL'S OWN CORNER (side-eye 2026-08-16 #94): the rail is
          full-bleed, so the LAST cell's inline-end edge IS the pane's edge and a flush glyph read as clipped.
          LOGICAL (`end-*`), never `right-*`. Spelled as a whole literal at each site (not hoisted) because
          `ui-size-via-variant` reads these class strings statically. */}
      {locked ? <Icon icon={Lock} size="xs" aria-hidden={true} className="absolute end-field top-field text-muted-foreground opacity-60" /> : null}
      {locked || isActive ? null : <ContextCellBadge count={count} dot={tab.badge === true} />}
    </TabsTab>
  );
}

function renderCellIcon(tab: ResolvedContextTab, isActive: boolean, locked: boolean): ReactElement | null {
  if (tab.icon === undefined) {
    return null;
  }
  const className = locked ? "opacity-60" : "";
  if (tab.icon === Crown) {
    return <Icon icon={Crown} size="sm" fill={isActive ? "solid" : "none"} className={className} />;
  }
  return <Icon icon={tab.icon} size="sm" className={className} />;
}

function ContextCellBadge({ count, dot }: { readonly count: number; readonly dot: boolean }): ReactElement | null {
  if (count > 0) {
    return (
      <Badge intent="primary" size="sm" aria-hidden={true} className="absolute end-field top-field">
        {count}
      </Badge>
    );
  }
  // The childless dot is Badge's `size="dot"` arm (#1798/#1799) — the ALLOWLIST-conversion receipt (why
  // this call site, why 6px) is at that arm's own header, `@orb/ui/badge/variants.ts`, one home.
  return dot ? <Badge intent="primary" size="dot" aria-hidden={true} className="absolute end-field top-field" /> : null;
}
