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

const DERIVED_SOURCE: readonly FixtureItem[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
];

/**
 * R7 (ui-primitive-contract, the systemic gap missing from all 3 virtual seals): the parent
 * re-renders passing a freshly-DERIVED items array — not a stable module-const reference.
 */
export function DerivedItemsMessageList(): ReactElement {
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
        <MessageList
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

function makeOlderItems(count: number): FixtureItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `older-${index}`,
    label: `Older ${index}`,
  }));
}

interface PrependableListProps {
  readonly initialCount: number;
  readonly rowHeightPx: number;
  readonly listHeightPx: number;
}

/**
 * The "load older history" shape: the reader is scrolled to the MIDDLE of the thread (not the
 * tail), then a batch of older items is PREPENDED — this is what message-list's own doc claims
 * (`getItemKey` is "id-based... lets the... bottom-anchor survive a prepend") and what R8's
 * `getItemKey`-keyed measurement cache (verified against the shipped virtual-core source: the
 * cache is keyed by `getItemKey(index)`, not by index) makes true by construction. The prepend
 * shifts every existing item's INDEX but not its KEY, so the reader's viewport position (which
 * message is on screen) must survive untouched.
 */
export function PrependableList({
  initialCount,
  rowHeightPx,
  listHeightPx,
}: PrependableListProps): ReactElement {
  const [items, setItems] = useState<FixtureItem[]>(() => makeItems(initialCount));
  return (
    <div>
      <button
        type="button"
        data-testid="prepend"
        onClick={(): void => setItems((prev) => [...makeOlderItems(20), ...prev])}
      >
        Load older
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
