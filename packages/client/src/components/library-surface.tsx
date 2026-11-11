// The library LIST body: the QueryBoundary shell with shared load and error copy, and the rows with their
// radiogroup keyboard contract. The pane chrome, its search and its scroll box are `ListPage`'s; a rows container
// owns the scroll box only when its `ListPage` body is `bounded`.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — it wires #data/#lib client seams; the ConfirmDialog
// homing precedent).

import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { QueryErrorState, SkeletonRows } from "#data";
import { ListScrollBox } from "./list-page.tsx";
import { QueryBoundary } from "./query-boundary.tsx";
import { useRovingRadioGroup } from "./use-roving-radio-group.ts";

const LIBRARY_LOADING_ROWS = 3;

export interface LibrarySurfaceShellProps {
  /** Suspense fallback copy, e.g. "Loading your presets…". */
  readonly loadingLabel: string;
  /** Error-boundary noun phrase, e.g. "your presets" (rendered as "Couldn't load your presets."). */
  readonly errorLabel: string;
  /**
   * The OWNER's surface-box id (#885/#1748). This shell is shared, so it can never mint a key of its own —
   * one literal here is one remembered box for every library that mounts it, a
   * copy-paste collision. Each owner mints its
   * own (`preset.library`, `databank.library`, …); omitted, the boundary reserves nothing, as before.
   */
  readonly reserveKey?: string | undefined;
  /** The list's read inputs, handed to the boundary's `resetKeys` (`[]` for a list whose read takes none). */
  readonly resetKeys: readonly unknown[];
  /** The querying list component (calls `useSuspenseQuery` — mounted inside the boundary). */
  readonly children: ReactNode;
}

/** The library-surface QueryBoundary shell: shared load and error/retry copy. Its `ListPage` sits above it and
 *  owns the focus root and, with a `scroll` body, the scroll box the boundary must not sever. */
export function LibrarySurfaceShell({ loadingLabel, errorLabel, reserveKey, resetKeys, children }: LibrarySurfaceShellProps): ReactElement {
  return (
    <QueryBoundary
      resetKeys={resetKeys}
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
  if (isEmpty) {
    return <>{empty}</>;
  }
  return scroll ? (
    <ListScrollBox {...rowsGroup} gap="tight" ref={rowsRef}>
      {children}
    </ListScrollBox>
  ) : (
    <Stack {...rowsGroup} gap="tight" ref={rowsRef}>
      {children}
    </Stack>
  );
}
