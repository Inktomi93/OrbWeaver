// The library-surface scaffold (clone-audit item 2): the search-input + row-list + empty-state shell shared
// by preset-library-surface ↔ world-info-library-surface. TWO layout composites (not one rigid component —
// the surfaces diverge on query hooks and the preset active-for-generation Select): `LibrarySurfaceShell`
// (focus-on-mount + QueryBoundary + load/error copy) wraps the querying list; `LibraryListLayout`
// (pre-search block + search + empty-or-rows body) is the body.
//
// The in-pane micro-caps TITLE + actions row this used to carry is GONE (list-pane-projection L4): both
// consumers now supply a `listHeader` and their title/create live in the `.shell-panel-header` band, like
// every other section's (D66 A1/A2). The A1/N2 migration this file once deferred to "a separate lane" IS
// that lane.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — it wires #data/#lib client seams; the ConfirmDialog
// homing precedent).

import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary, QueryErrorState } from "#data";

export interface LibrarySurfaceShellProps {
  /** Suspense fallback copy, e.g. "Loading your presets…". */
  readonly loadingLabel: string;
  /** Error-boundary noun phrase, e.g. "your presets" (rendered as "Couldn't load your presets."). */
  readonly errorLabel: string;
  /** The querying list component (calls `useSuspenseQuery` — mounted inside the boundary). */
  readonly children: ReactNode;
}

/** The library-surface QueryBoundary shell: shared load + error/retry copy. The caller owns the outer
 *  focus-on-mount container (the surface-purity `A11y focus restoration` gate scans the surface file). */
export function LibrarySurfaceShell({ loadingLabel, errorLabel, children }: LibrarySurfaceShellProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">{loadingLabel}</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label={errorLabel} onRetry={retry} />}
    >
      {children}
    </QueryBoundary>
  );
}

export interface LibraryListLayoutProps {
  /** Optional block above the search (e.g. the preset active-for-generation Select). */
  readonly beforeSearch?: ReactNode;
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchPlaceholder: string;
  readonly searchLabel: string;
  /** True → render `empty` instead of the rows. */
  readonly isEmpty: boolean;
  /** The empty/no-match state (an `EmptyState`). */
  readonly empty?: ReactNode;
  /** The rows (rendered in the scroll area when not empty). */
  readonly children: ReactNode;
}

/** The library list body: an optional pre-search block, a search input, then empty-or-rows. */
export function LibraryListLayout({
  beforeSearch,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  isEmpty,
  empty,
  children,
}: LibraryListLayoutProps): ReactElement {
  return (
    <Stack className="h-full" gap="block">
      {beforeSearch}

      <Input aria-label={searchLabel} onValueChange={onSearchChange} placeholder={searchPlaceholder} value={searchValue} />

      {isEmpty ? (
        empty
      ) : (
        <Stack className="min-h-0 flex-1 overflow-y-auto" gap="field">
          {children}
        </Stack>
      )}
    </Stack>
  );
}
