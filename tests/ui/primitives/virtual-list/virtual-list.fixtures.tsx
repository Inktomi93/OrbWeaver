// CT fixtures for the VirtualList seal. Playwright CT serializes mount props, so the function
// props (getItemKey/estimateSize/renderItem) live HERE; the tests pass only numbers/strings.
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement, ReactNode } from "react";
import { Component } from "react";

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
export function BoundedList({
  itemCount,
  rowHeightPx,
  listHeightPx,
}: BoundedListProps): ReactElement {
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
          renderItem={(item): ReactElement => (
            <div style={{ height: rowHeightPx }}>{item.label}</div>
          )}
        />
      </div>
    </TripwireBoundary>
  );
}
