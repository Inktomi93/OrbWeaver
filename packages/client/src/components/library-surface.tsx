// The library-surface scaffold (clone-audit item 2): the search-input + row-list + empty-state + header-band
// shell shared by preset-library-surface ↔ world-info-library-surface. TWO layout composites (not one rigid
// component — the surfaces diverge on query hooks, an Import affordance, and the preset active-for-generation
// Select): `LibrarySurfaceShell` (focus-on-mount + QueryBoundary + load/error copy) wraps the querying list;
// `LibraryListLayout` (micro-caps header band + trailing actions + search + empty-or-rows body) is the body.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — it wires #data/#lib client seams; the ConfirmDialog homing
// precedent). Behavior-preserving: the header band is the CURRENT micro-caps Row (the north-star A1/N2 chrome
// migration to shell-panel-header is a separate lane — this consolidation does not fork or pre-empt it).

import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary } from "#data";

export interface LibrarySurfaceShellProps {
  /** Suspense fallback copy, e.g. "Loading your presets…". */
  readonly loadingLabel: string;
  /** Error-boundary copy, e.g. "Couldn't load your presets.". */
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
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          {errorLabel}{" "}
          <Button intent="ghost" onClick={retry}>
            Retry
          </Button>
        </Text>
      )}
    >
      {children}
    </QueryBoundary>
  );
}

export interface LibraryListLayoutProps {
  /** Micro-caps section title (the header band's label). */
  readonly title: string;
  /** The header band's trailing actions (New, Import…). */
  readonly actions: ReactNode;
  /** Optional block between the header band and the search (e.g. the preset active-for-generation Select). */
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

/** The library list body: micro-caps header band + trailing actions, a search input, then empty-or-rows. */
export function LibraryListLayout({
  title,
  actions,
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
      <Row align="center" gap="field" justify="between">
        <Text size="micro" tone="muted" transform="caps">
          {title}
        </Text>
        <Row align="center" gap="field">
          {actions}
        </Row>
      </Row>

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
