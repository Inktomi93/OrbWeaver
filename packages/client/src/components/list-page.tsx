// The LIST pane template: an instrument-tier focus root, its search row and one scroll box (UI-Density-Law §3.1).
// The pane's scroll box is exactly one element, and `body` names which, because a QueryBoundary reservation
// severs any `flex-1` below it and a self-scrolling VirtualList needs a definite parent instead.

import type { StackProps } from "@orb/ui/layout";
import { Row, Stack, Surface } from "@orb/ui/layout";
import type { ComponentProps, KeyboardEventHandler, ReactElement, ReactNode, RefObject } from "react";
import { ListSearch } from "./list-search.tsx";
import { SkipToFirstRow } from "./skip-to-first-row.tsx";

/** The one element a LIST pane scrolls in: the `ListPage` body, or the rows under a `bounded` body. */
export function ListScrollBox({ gap, ...props }: Omit<ComponentProps<"div">, "className"> & { readonly gap?: StackProps["gap"] }): ReactElement {
  return <Stack {...props} gap={gap} scroll="y" grow={true} data-slot="library-list-scroll" />;
}

/** `scroll`: the body is the scroll box. `bounded`: the body is a bounded column whose rows or VirtualList scroll
 *  themselves. `pane`: the whole pane scrolls with its chrome. */
const LIST_PAGE_BODIES = ["scroll", "bounded", "pane"] as const;

export interface ListPageProps {
  /** The pane's focus target, also the skip link's search scope. */
  readonly ref: RefObject<HTMLDivElement | null>;
  /** Names the root as a region, so arrival focus announces the pane. */
  readonly label?: string;
  readonly "data-testid"?: string;
  readonly "data-slot"?: string;
  /** The skip link's label; it lands on the first row past the pane's chrome. */
  readonly skipTo?: string;
  /** Content above the search row: shortcuts, a banner or an active scope. */
  readonly lead?: ReactNode;
  /** The search control itself. */
  readonly search: ReactNode;
  /** Controls that share the search row, after the search. */
  readonly searchAside?: ReactNode;
  /** Content between the search row and the body. */
  readonly filters?: ReactNode;
  /** Which element owns the pane's scroll box. */
  readonly body?: (typeof LIST_PAGE_BODIES)[number];
  readonly onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  readonly children: ReactNode;
}

/** `[skip] lead · [search … aside] · filters · body` in one instrument-tier LIST pane. */
export function ListPage({
  ref,
  label,
  skipTo,
  lead,
  search,
  searchAside,
  filters,
  body = "scroll",
  onKeyDown,
  children,
  ...data
}: ListPageProps): ReactElement {
  return (
    <Surface tier="instrument">
      <Stack
        {...data}
        data-list-page={body}
        {...(label === undefined ? {} : { "aria-label": label, role: "region" })}
        className="min-block-0"
        height="fill"
        focusTarget={true}
        scroll={body === "pane" ? "y" : undefined}
        gap="row"
        onKeyDown={onKeyDown}
        ref={ref}
        tabIndex={-1}
      >
        {skipTo === undefined ? null : <SkipToFirstRow containerRef={ref}>{skipTo}</SkipToFirstRow>}
        {lead}
        <Row align="center" wrap={true} gap="field">
          <Row align="center" className="min-inline-0" floor="field" grow={true} cap="fit">
            <ListSearch>{search}</ListSearch>
          </Row>
          {/* The aside wraps as one cluster at the row's end, so the search keeps its floor and a control never strands alone. */}
          {searchAside === undefined ? null : (
            <Row align="center" className="shrink-0" push="inlineEnd" gap="field">
              {searchAside}
            </Row>
          )}
        </Row>
        {filters}
        {body === "pane" ? children : null}
        {body === "scroll" ? <ListScrollBox>{children}</ListScrollBox> : null}
        {body === "bounded" ? (
          <Stack className="min-block-0" grow={true} data-slot="library-list-bounded">
            {children}
          </Stack>
        ) : null}
      </Stack>
    </Surface>
  );
}
