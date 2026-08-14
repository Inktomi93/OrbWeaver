// CT fixtures for the VirtualList seal. Playwright CT serializes mount props, so the function
// props (getItemKey/estimateSize/renderItem) live HERE; the tests pass only numbers/strings.
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement, ReactNode } from "react";
import { Component, useRef, useState } from "react";

interface FixtureItem {
  readonly id: string;
  readonly label: string;
}

function makeItems(count: number): FixtureItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `fixture-${index}`,
    label: `Item ${index}`,
  }));
}

interface ListFixtureProps {
  readonly itemCount: number;
  readonly rowHeightPx: number;
}

interface BoundedListProps extends ListFixtureProps {
  readonly listHeightPx: number;
}

/** A 1000-item-scale list inside a BOUNDED parent — the legal shape (caller owns the height). */
export function BoundedList({ itemCount, rowHeightPx, listHeightPx }: BoundedListProps): ReactElement {
  const items = makeItems(itemCount);
  return (
    <div style={{ height: listHeightPx }}>
      <VirtualList
        items={items}
        getItemKey={(item): string => item.id}
        estimateSize={(): number => rowHeightPx}
        renderItem={(item): ReactElement => <div style={{ height: rowHeightPx }}>{item.label}</div>}
        className="h-full"
      />
    </div>
  );
}

interface CaughtState {
  readonly message: string | null;
}

class TripwireBoundary extends Component<{ readonly children: ReactNode }, CaughtState> {
  override state: CaughtState = { message: null };

  static getDerivedStateFromError(error: Error): CaughtState {
    return { message: error.message };
  }

  override render(): ReactNode {
    if (this.state.message !== null) {
      return <div role="alert">{this.state.message}</div>;
    }
    return this.props.children;
  }
}

/** The misuse shape: no bounded parent — the seal's D43 §11.3 tripwire must THROW at mount. */
export function UnboundedList({ itemCount, rowHeightPx }: ListFixtureProps): ReactElement {
  const items = makeItems(itemCount);
  return (
    <TripwireBoundary>
      <div>
        <VirtualList
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => rowHeightPx}
          renderItem={(item): ReactElement => <div style={{ height: rowHeightPx }}>{item.label}</div>}
        />
      </div>
    </TripwireBoundary>
  );
}

const DERIVED_SOURCE: readonly FixtureItem[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
];

/**
 * R7 (ui-primitive-contract, the systemic virtual-seal gap): the parent re-renders passing a
 * freshly-DERIVED (filter+map) items array — not a stable module-const reference — proving the
 * seal doesn't secretly depend on item array identity surviving a render (the sortable.fixtures.tsx
 * `DerivedItemsList` precedent).
 */
export function DerivedItemsList(): ReactElement {
  const [bump, setBump] = useState(0);
  const items = DERIVED_SOURCE.filter((entry) => entry.label.length > 0).map((entry) => ({
    ...entry,
  }));

  return (
    <div>
      <button data-testid="rerender" onClick={(): void => setBump((n) => n + 1)} type="button">
        rerender {bump}
      </button>
      <div style={{ height: 200 }}>
        <VirtualList
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => 40}
          renderItem={(item): ReactElement => <div style={{ height: 40 }}>{item.label}</div>}
          className="h-full"
        />
      </div>
    </div>
  );
}

interface LanesListProps {
  readonly itemCount: number;
  readonly lanes: number;
}

/** Passthrough smoke: `lanes` reaches the virtualizer — every row carries the `data-lane` this
 *  seal stamps from `virtualItem.lane`, round-robined 0..lanes-1. */
export function LanesList({ itemCount, lanes }: LanesListProps): ReactElement {
  const items = makeItems(itemCount);
  return (
    <div style={{ height: 300 }}>
      <VirtualList
        items={items}
        getItemKey={(item): string => item.id}
        estimateSize={(): number => 20}
        lanes={lanes}
        renderItem={(item): ReactElement => <div style={{ height: 20 }}>{item.label}</div>}
        className="h-full"
      />
    </div>
  );
}

/** Passthrough smoke: a custom `rangeExtractor` that always force-includes index 0 alongside the
 *  normal overscan window — proves the option actually reaches `useVirtualizer`, not just typed. */
export function CustomRangeExtractorList({ itemCount }: { readonly itemCount: number }): ReactElement {
  const items = makeItems(itemCount);
  return (
    <div style={{ height: 200 }}>
      <VirtualList
        items={items}
        getItemKey={(item): string => item.id}
        estimateSize={(): number => 40}
        rangeExtractor={(range): number[] => {
          const base = new Set<number>();
          for (let i = range.startIndex; i <= range.endIndex; i += 1) {
            base.add(i);
          }
          base.add(0);
          return Array.from(base).sort((a, b) => a - b);
        }}
        renderItem={(item): ReactElement => <div style={{ height: 40 }}>{item.label}</div>}
        className="h-full"
      />
    </div>
  );
}

/** `overscan` distinguishes from the seal's own default (1): a larger value renders more off-screen
 *  rows than the default window. */
export function OverscanList({ itemCount, overscan }: { readonly itemCount: number; readonly overscan?: number }): ReactElement {
  const items = makeItems(itemCount);
  return (
    <div style={{ height: 200 }}>
      <VirtualList
        items={items}
        getItemKey={(item): string => item.id}
        estimateSize={(): number => 20}
        {...(overscan === undefined ? {} : { overscan })}
        renderItem={(item): ReactElement => <div style={{ height: 20 }}>{item.label}</div>}
        className="h-full"
      />
    </div>
  );
}

/** `fadeEdge`: proves the `data-more` cue is present while more list is below the fold and lifts
 *  once scrolled to the bottom — the default (false) never writes the attribute at all. */
export function FadeEdgeList({ itemCount, fadeEdge }: { readonly itemCount: number; readonly fadeEdge: boolean }): ReactElement {
  const items = makeItems(itemCount);
  return (
    <div style={{ height: 200 }}>
      <VirtualList
        items={items}
        getItemKey={(item): string => item.id}
        estimateSize={(): number => 40}
        fadeEdge={fadeEdge}
        renderItem={(item): ReactElement => <div style={{ height: 40 }}>{item.label}</div>}
        className="h-full"
      />
    </div>
  );
}

/** `scrollToIndex`: the declarative "pin to bottom" seam — flipping the prop scrolls the last item
 *  into view (end-aligned), unlike `BoundedList` which never scrolls programmatically. */
export function ScrollToIndexList({ itemCount }: { readonly itemCount: number }): ReactElement {
  const items = makeItems(itemCount);
  const [target, setTarget] = useState<number | undefined>(undefined);
  return (
    <div>
      <button data-testid="pin-to-end" onClick={(): void => setTarget(itemCount - 1)} type="button">
        pin
      </button>
      <div style={{ height: 200 }}>
        <VirtualList
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => 40}
          {...(target === undefined ? {} : { scrollToIndex: target })}
          renderItem={(item): ReactElement => <div style={{ height: 40 }}>{item.label}</div>}
          className="h-full"
        />
      </div>
    </div>
  );
}

/** `onEndApproach`/`endApproachRows`: fires once the rendered window's last index is within
 *  `endApproachRows` of the tail — a small list (below the threshold from mount) fires immediately;
 *  a distinct counter of invocations proves it isn't re-firing every render. */
export function EndApproachList({ itemCount, endApproachRows }: { readonly itemCount: number; readonly endApproachRows?: number }): ReactElement {
  const items = makeItems(itemCount);
  const [calls, setCalls] = useState(0);
  // Stable identity: `onEndApproach` is an effect dependency on the seal side (VirtualList's own
  // useLayoutEffect deps list), so an inline arrow recreated on every re-render would retrigger the
  // effect every time `calls` changes — an infinite update loop, not a defect in the seal itself.
  // A ref (not useCallback — the Compiler already memoizes compiled code, D54/no-manual-memo) keeps
  // the SAME function identity across renders: the initializer runs once, `setCalls` is itself
  // React-guaranteed stable, so the closure never needs to be recreated.
  const handleEndApproachRef = useRef((): void => setCalls((n) => n + 1));
  return (
    <div>
      <div data-testid="calls">{calls}</div>
      <div style={{ height: 200 }}>
        <VirtualList
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => 40}
          onEndApproach={handleEndApproachRef.current}
          {...(endApproachRows === undefined ? {} : { endApproachRows })}
          renderItem={(item): ReactElement => <div style={{ height: 40 }}>{item.label}</div>}
          className="h-full"
        />
      </div>
    </div>
  );
}

/** `aria-label` passthrough onto the `role="list"` scroll container. */
export function AriaLabelList({ itemCount, ariaLabel }: { readonly itemCount: number; readonly ariaLabel: string }): ReactElement {
  const items = makeItems(itemCount);
  return (
    <div style={{ height: 200 }}>
      <VirtualList
        items={items}
        getItemKey={(item): string => item.id}
        estimateSize={(): number => 40}
        aria-label={ariaLabel}
        renderItem={(item): ReactElement => <div style={{ height: 40 }}>{item.label}</div>}
        className="h-full"
      />
    </div>
  );
}
