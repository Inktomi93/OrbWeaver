// CT fixtures for the MessageList seal. Playwright CT serializes mount props, so the function props
// (getItemKey/estimateSize/renderItem) — and the stateful "append a message" story — live HERE; the
// tests themselves pass only numbers/strings (the virtual-list.fixtures.tsx precedent).
import { MessageList } from "@orb/ui/message-list";
import type { ReactElement, ReactNode } from "react";
import { Component, useState } from "react";

interface FixtureItem {
  readonly id: string;
  readonly label: string;
}

function makeItems(count: number, offset = 0): FixtureItem[] {
  return Array.from({ length: count }, (_, index) => {
    const n = index + offset;
    return { id: `fixture-${n}`, label: `Message ${n}` };
  });
}

interface AppendableListProps {
  readonly initialCount: number;
  readonly rowHeightPx: number;
  readonly listHeightPx: number;
}

/** A growable, bottom-anchored list — the "Add message" button appends ONE item at the tail, the
 *  real chat shape (new turns land at the end; the reader may or may not be pinned there). */
export function AppendableList({
  initialCount,
  rowHeightPx,
  listHeightPx,
}: AppendableListProps): ReactElement {
  const [items, setItems] = useState<FixtureItem[]>(() => makeItems(initialCount));
  return (
    <div>
      <button
        type="button"
        data-testid="append"
        onClick={(): void => setItems((prev) => [...prev, ...makeItems(1, prev.length)])}
      >
        Add message
      </button>
      <div style={{ height: listHeightPx }}>
        <MessageList
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => rowHeightPx}
          renderItem={(item): ReactElement => (
            <div style={{ height: rowHeightPx }}>{item.label}</div>
          )}
          className="h-full"
        />
      </div>
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

interface UnboundedProps {
  readonly itemCount: number;
  readonly rowHeightPx: number;
}

/** The misuse shape: no bounded parent — the D43 §11.3 tripwire must THROW at mount. */
export function UnboundedMessageList({ itemCount, rowHeightPx }: UnboundedProps): ReactElement {
  const items = makeItems(itemCount);
  return (
    <TripwireBoundary>
      <div>
        <MessageList
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
