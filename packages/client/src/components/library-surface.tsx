// The library LIST body: the QueryBoundary shell with shared load and error copy, and the rows with their
// radiogroup keyboard contract. The pane chrome, its search and its scroll box are `ListPage`'s; a rows container
// owns the scroll box only when its `ListPage` body is `bounded`.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — it wires #data/#lib client seams; the ConfirmDialog
// homing precedent).

import { Stack } from "@orb/ui/layout";
import type { FocusEvent, ReactElement, ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import { QueryErrorState, SkeletonRows } from "#data";
import { ListScrollBox } from "./list-page.tsx";
import { QueryBoundary } from "./query-boundary.tsx";
import { useRovingRadioGroup } from "./use-roving-radio-group.ts";

const LIBRARY_LOADING_ROWS = 3;
/** The first control of a row, where a removed neighbour's focus lands. */
const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";
/** How long a removed row's focus hand-off waits for the confirm that removed it to close. */
const FOCUS_WATCH_MS = 3000;

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

/** The library-surface QueryBoundary shell: shared load and error/retry copy. Its `ListPage` sits above it and
 *  owns the focus root and, with a `scroll` body, the scroll box the boundary must not sever. */
export function LibrarySurfaceShell({ loadingLabel, errorLabel, reserveKey, children }: LibrarySurfaceShellProps): ReactElement {
  return (
    <QueryBoundary
      fallback={
        <Stack role="status" aria-label={loadingLabel}>
          <SkeletonRows count={LIBRARY_LOADING_ROWS} />
        </Stack>
      }
      renderError={(_error, retry): ReactElement => <QueryErrorState label={errorLabel} onRetry={retry} />}
      {...(reserveKey === undefined ? {} : { reserveKey })}
    >
      {children}
    </QueryBoundary>
  );
}

export interface LibraryListRowsProps {
  /** True → render `empty` instead of the rows. */
  readonly isEmpty: boolean;
  /** The empty/no-match state (an `EmptyState`). */
  readonly empty?: ReactNode;
  /** The rows, rendered when not empty. */
  readonly children: ReactNode;
  /**
   * Names the ROWS container as a `role="radiogroup"` — for a list whose rows carry a ONE-OF-N state
   * toggle (`RowToggleAction semantics="radio"`), so the radios have the owning group ARIA requires
   * (side-eye F-19 / ARIA rec 3). Omit for every other list: an unnamed list stays a plain container, so
   * this is additive and changes nothing for a caller that does not pass it.
   */
  readonly rowsRadiogroupLabel?: string;
  /** The rows own the pane's scroll box. True under a `bounded` `ListPage` body, false under a `scroll` one,
   *  which already is the box. */
  readonly scroll: boolean;
}

/** The row a removed row's focus should move to, or the list's root when none is left. A confirmed delete unmounts the
 *  row (and the menu that opened its confirm), so the browser drops focus on the page body; this hands it to the row now
 *  at the same place, or the one before it. It acts only when focus was inside the rows and is now nowhere. */
function useFocusAfterRowRemoved(rowsRef: RefObject<HTMLDivElement | null>): { readonly onFocus: (event: FocusEvent<HTMLElement>) => void } {
  const seen = useRef({
    index: -1,
    count: 0,
    root: null as HTMLElement | null,
    watch: null as MutationObserver | null,
    giveUp: undefined as ReturnType<typeof globalThis.setTimeout> | undefined,
  });
  useEffect(() => {
    const count = rowsRef.current?.children.length ?? 0;
    const shrank = seen.current.index >= 0 && count < seen.current.count;
    seen.current.count = count;
    if (!shrank) {
      return;
    }
    const restore = (): boolean => {
      if (document.activeElement !== null && document.activeElement !== document.body) {
        return false;
      }
      const live = rowsRef.current;
      const last = (live?.children.length ?? 0) - 1;
      const row = live?.children[Math.min(seen.current.index, last)];
      seen.current.index = -1;
      (row?.querySelector<HTMLElement>(FOCUSABLE) ?? seen.current.root)?.focus();
      return true;
    };
    if (restore()) {
      return;
    }
    // The confirm that deleted the row is still open and holds focus; it hands focus to the removed trigger as it closes.
    seen.current.watch?.disconnect();
    globalThis.clearTimeout(seen.current.giveUp);
    const watch = new MutationObserver(() => {
      if (restore()) {
        watch.disconnect();
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });
    seen.current.watch = watch;
    seen.current.giveUp = globalThis.setTimeout(() => watch.disconnect(), FOCUS_WATCH_MS);
  });
  useEffect(
    () => (): void => {
      seen.current.watch?.disconnect();
      globalThis.clearTimeout(seen.current.giveUp);
    },
    [],
  );
  return {
    onFocus: (event): void => {
      const rows = event.currentTarget;
      // A portaled confirm bubbles its focus through the React tree; only focus inside the rows counts.
      if (!rows.contains(event.target)) {
        return;
      }
      const row = Array.from(rows.children).find((child) => child.contains(event.target));
      seen.current.index = row === undefined ? -1 : Array.from(rows.children).indexOf(row);
      seen.current.root = rows.closest<HTMLElement>("[tabindex]");
    },
  };
}

/** The library list BODY: empty-or-rows, plus the radiogroup keyboard contract. Everything here depends on
 *  the read, so this is the half that lives INSIDE the boundary. */
export function LibraryListRows({ isEmpty, empty, children, rowsRadiogroupLabel, scroll }: LibraryListRowsProps): ReactElement {
  const rowsGroup = rowsRadiogroupLabel === undefined ? {} : { role: "radiogroup", "aria-label": rowsRadiogroupLabel };
  // The radiogroup's keyboard contract (side-eye F-5) — roving tabindex + Arrow/Home/End moving FOCUS ONLY,
  // with Space/Enter as the commit (#481: arrows used to activate, and this list's activation is a persisted
  // global setting). A no-op on a list that renders no `[role=radio]`, which is why it can mount
  // unconditionally beside the optional role.
  const rowsRef = useRef<HTMLDivElement>(null);
  useRovingRadioGroup(rowsRef);
  const focusWatch = useFocusAfterRowRemoved(rowsRef);
  if (isEmpty) {
    return <>{empty}</>;
  }
  return scroll ? (
    <ListScrollBox {...rowsGroup} {...focusWatch} gap="tight" ref={rowsRef}>
      {children}
    </ListScrollBox>
  ) : (
    <Stack {...rowsGroup} {...focusWatch} gap="tight" ref={rowsRef}>
      {children}
    </Stack>
  );
}
