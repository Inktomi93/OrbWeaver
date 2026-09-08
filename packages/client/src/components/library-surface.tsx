// The library-surface scaffold (clone-audit item 2): the search-input + row-list + empty-state shell shared
// by preset-library-surface ↔ world-info-library-surface. TWO layout composites (not one rigid component —
// the surfaces diverge on their query hooks): `LibrarySurfaceShell` (focus-on-mount + QueryBoundary +
// load/error copy) wraps the querying list; `LibraryListLayout` (search + empty-or-rows body) is the body.
//
// THE LAYOUT IS SPLIT IN TWO, AND THAT SPLIT IS LOAD-BEARING (#1748, the #1133 hoist). `LibraryListFrame`
// is the pane CHROME — the instrument Surface and the pinned search input; `LibraryListRows` is the
// DATA-dependent body — empty-or-rows plus the radiogroup keyboard contract. They are separate because a
// `QueryBoundary` with a `reserveKey` wraps its settled child in an auto-height measuring Stack: any scroll
// box UNDER the boundary resolves its `h-full`/`flex-1` against an indefinite parent, stops scrolling, and
// strands everything past the fold. A consumer that needs a boundary in the middle therefore mounts the frame
// ABOVE it — search chrome and all, which is also why the input stays on screen while the read is in flight.
//
// THE SCROLL BOX IS ONE ELEMENT, and `scroll` names WHICH: on the frame when a boundary splits the two, on
// the rows otherwise (the default, and the original DOM). It is not a stylistic knob — a body whose own
// height chain must survive, like the databank pane's `<VirtualList className="h-full">`, only works with the
// rows arm, and a keyed boundary only works with the frame arm.
//
// WHY THE TWO COMPOSITES CANNOT SIMPLY MERGE: `LibraryListLayout` has FOUR consumers but only TWO of them
// (preset, databank) nest it inside `LibrarySurfaceShell`'s boundary — `refinery-list-surface` composes the
// layout with no shell at all, and the shell's THIRD consumer (`extensions-switcher-surface`) uses no layout.
// One merged component would force a boundary on the first and a layout on the second. `LibraryListLayout`
// survives as exactly `LibraryListFrame` + `LibraryListRows` for the two consumers that need no boundary
// between them, so there is one definition of each piece and nothing to re-merge.
//
// The `beforeSearch` slot is GONE with its one consumer: presets' pane-level "Active for generation" Select
// died when activation became the row's own toggle (redesign §9/D1). A pane-scoped block above the search is
// exactly the chrome a mixed-kind config list can't keep, so the slot goes with it rather than waiting.
//
// The in-pane micro-caps TITLE + actions row this used to carry is GONE (L4): both
// consumers now supply a `listHeader` and their title/create live in the `.shell-panel-header` band, like
// every other section's (D66 A1/A2). The A1/N2 migration this file once deferred to "a separate lane" IS
// that lane.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — it wires #data/#lib client seams; the ConfirmDialog
// homing precedent).

import { Input } from "@orb/ui/input";
import { Stack, Surface } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { QueryErrorState } from "#data";
import { QueryBoundary } from "./query-boundary.tsx";
import { useRovingRadioGroup } from "./use-roving-radio-group.ts";

export interface LibrarySurfaceShellProps {
  /** Suspense fallback copy, e.g. "Loading your presets…". */
  readonly loadingLabel: string;
  /** Error-boundary noun phrase, e.g. "your presets" (rendered as "Couldn't load your presets."). */
  readonly errorLabel: string;
  /**
   * The OWNER's surface-box id (#885/#1748). This shell is shared, so it can never mint a key of its own —
   * one literal here is one remembered box for every library that mounts it, which is exactly the
   * copy-paste collision the `query-boundary-reservation` gate's duplicate arm reds. Each owner mints its
   * own (`preset.library`, `databank.library`, …); omitted, the boundary reserves nothing, as before.
   */
  readonly reserveKey?: string | undefined;
  /** The querying list component (calls `useSuspenseQuery` — mounted inside the boundary). */
  readonly children: ReactNode;
}

/** The library-surface QueryBoundary shell: shared load + error/retry copy. The caller owns the outer
 *  focus-on-mount container (the surface-purity `A11y focus restoration` gate scans the surface file) AND,
 *  since #1748, the `LibraryListFrame` that carries the pane's scroll box above this boundary. */
export function LibrarySurfaceShell({ loadingLabel, errorLabel, reserveKey, children }: LibrarySurfaceShellProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">{loadingLabel}</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label={errorLabel} onRetry={retry} />}
      {...(reserveKey === undefined ? {} : { reserveKey })}
    >
      {children}
    </QueryBoundary>
  );
}

/** The one class string the pane's scroll box wears, whichever of the two elements owns it. */
const LIBRARY_SCROLL_BOX = "relative min-h-0 flex-1 overflow-y-auto overscroll-contain";

export interface LibraryListFrameProps {
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchPlaceholder: string;
  readonly searchLabel: string;
  /**
   * THE FRAME OWNS THE PANE'S SCROLL BOX. Exactly one of `LibraryListFrame.scroll` and
   * `LibraryListRows.scroll` is true — the scroller is one element, and WHICH element it is depends on
   * whether a `QueryBoundary` sits between them (#1748): with a boundary in the middle the box must be up
   * here, because the reservation's auto-height measuring Stack severs any `flex-1` below it. Default false
   * = the rows own it, which is the un-split `LibraryListLayout` shape.
   */
  readonly scroll?: boolean;
  /** The frame's body — a `LibraryListRows`, or the `QueryBoundary` that renders one. */
  readonly children: ReactNode;
}

/** The library list CHROME: the instrument-tier surface and the pinned search input, plus the pane's scroll
 *  box when `scroll` says this is where it lives. Mounts ABOVE any `QueryBoundary` (#1748) — see the header. */
export function LibraryListFrame({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  scroll = false,
  children,
}: LibraryListFrameProps): ReactElement {
  return (
    // INSTRUMENT tier (UI-Density-Law.md §3.1 LIST panes) — presets and world-info books are scanned
    // lists, not forms. Declared once here, so both consuming surfaces get identical density by
    // construction instead of each picking steps by taste.
    <Surface tier="instrument">
      <Stack className="h-full" gap="row">
        <Input aria-label={searchLabel} onValueChange={onSearchChange} placeholder={searchPlaceholder} value={searchValue} />

        {scroll ? (
          <Stack className={LIBRARY_SCROLL_BOX} data-slot="library-list-scroll">
            {children}
          </Stack>
        ) : (
          children
        )}
      </Stack>
    </Surface>
  );
}

export interface LibraryListRowsProps {
  /** True → render `empty` instead of the rows. */
  readonly isEmpty: boolean;
  /** The empty/no-match state (an `EmptyState`). */
  readonly empty?: ReactNode;
  /** The rows (rendered in the frame's scroll area when not empty). */
  readonly children: ReactNode;
  /**
   * Names the ROWS container as a `role="radiogroup"` — for a list whose rows carry a ONE-OF-N state
   * toggle (`RowToggleAction semantics="radio"`), so the radios have the owning group ARIA requires
   * (side-eye F-19 / ARIA rec 3). Omit for every other list: an unnamed list stays a plain container, so
   * this is additive and changes nothing for a caller that does not pass it.
   */
  readonly rowsRadiogroupLabel?: string;
  /**
   * THE ROWS OWN THE PANE'S SCROLL BOX — the un-split default, and the twin of `LibraryListFrame.scroll`
   * (exactly one is true; that prop's doc is the one home for why). A consumer with a `QueryBoundary`
   * between the frame and these rows passes `false`: the box lives on the frame instead, because the
   * reservation's auto-height measuring Stack cannot carry a `flex-1` through (#1748/#1133).
   */
  readonly scroll?: boolean;
}

/** The library list BODY: empty-or-rows, plus the radiogroup keyboard contract. Everything here depends on
 *  the read, so this is the half that lives INSIDE the boundary. */
export function LibraryListRows({ isEmpty, empty, children, rowsRadiogroupLabel, scroll = true }: LibraryListRowsProps): ReactElement {
  const rowsGroup = rowsRadiogroupLabel === undefined ? {} : { role: "radiogroup", "aria-label": rowsRadiogroupLabel };
  // The radiogroup's keyboard contract (side-eye F-5) — roving tabindex + Arrow/Home/End moving FOCUS ONLY,
  // with Space/Enter as the commit (#481: arrows used to activate, and this list's activation is a persisted
  // global setting). A no-op on a list that renders no `[role=radio]`, which is why it can mount
  // unconditionally beside the optional role.
  const rowsRef = useRef<HTMLDivElement>(null);
  useRovingRadioGroup(rowsRef);
  if (isEmpty) {
    return <>{empty}</>;
  }
  return (
    <Stack {...rowsGroup} {...(scroll ? { className: LIBRARY_SCROLL_BOX, "data-slot": "library-list-scroll" } : {})} gap="tight" ref={rowsRef}>
      {children}
    </Stack>
  );
}

export interface LibraryListLayoutProps extends Omit<LibraryListFrameProps, "scroll">, Omit<LibraryListRowsProps, "scroll"> {}

/** Frame + rows with NOTHING between them, and therefore the original single-scroller DOM: the rows container
 *  IS the pane's scroll box. For consumers whose read has already settled by the time the list renders
 *  (`refinery-list-surface`, the databank pane, the CT harness), where nothing severs the height chain — the
 *  databank body's own `<VirtualList className="h-full">` needs that chain intact and is what proves it. */
export function LibraryListLayout({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  isEmpty,
  empty,
  children,
  rowsRadiogroupLabel,
}: LibraryListLayoutProps): ReactElement {
  return (
    <LibraryListFrame onSearchChange={onSearchChange} searchLabel={searchLabel} searchPlaceholder={searchPlaceholder} searchValue={searchValue}>
      <LibraryListRows isEmpty={isEmpty} {...(empty === undefined ? {} : { empty })} {...(rowsRadiogroupLabel === undefined ? {} : { rowsRadiogroupLabel })}>
        {children}
      </LibraryListRows>
    </LibraryListFrame>
  );
}
