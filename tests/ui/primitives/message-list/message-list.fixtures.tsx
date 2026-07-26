// CT fixtures for the MessageList seal. Playwright CT serializes mount props, so the function props
// (getItemKey/estimateSize/renderItem) — and the stateful "append a message" story — live HERE; the
// tests themselves pass only numbers/strings (the virtual-list.fixtures.tsx precedent).
import type { MessageListHandle, MessageListProps } from "@orb/ui/message-list";
import { MessageList } from "@orb/ui/message-list";
import type { ReactElement, ReactNode } from "react";
import { Component, useRef, useState } from "react";

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
export function AppendableList({ initialCount, rowHeightPx, listHeightPx }: AppendableListProps): ReactElement {
  const [items, setItems] = useState<FixtureItem[]>(() => makeItems(initialCount));
  return (
    <div>
      <button type="button" data-testid="append" onClick={(): void => setItems((prev) => [...prev, ...makeItems(1, prev.length)])}>
        Add message
      </button>
      <div style={{ height: listHeightPx }}>
        <MessageList
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => rowHeightPx}
          renderItem={(item): ReactElement => <div style={{ height: rowHeightPx }}>{item.label}</div>}
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
export function PrependableList({ initialCount, rowHeightPx, listHeightPx }: PrependableListProps): ReactElement {
  const [items, setItems] = useState<FixtureItem[]>(() => makeItems(initialCount));
  return (
    <div>
      <button type="button" data-testid="prepend" onClick={(): void => setItems((prev) => [...makeOlderItems(20), ...prev])}>
        Load older
      </button>
      <div style={{ height: listHeightPx }}>
        <MessageList
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => rowHeightPx}
          renderItem={(item): ReactElement => <div style={{ height: rowHeightPx }}>{item.label}</div>}
          className="h-full"
        />
      </div>
    </div>
  );
}

/** Passthrough smoke (PD-119 mechanism): a custom `rangeExtractor` that always force-includes
 *  index 0 alongside the normal overscan window — proves the option reaches `useVirtualizer` on
 *  this seal too, mirroring `virtual-list`'s own `CustomRangeExtractorList`. The list is
 *  bottom-anchored by default, so index 0 sits far outside the natural viewport from the moment it
 *  mounts — no scrolling needed to prove the forced row survives off-screen. */
export function RangeExtractorMessageList({ itemCount }: { readonly itemCount: number }): ReactElement {
  const items = makeItems(itemCount);
  return (
    <div style={{ height: 200 }}>
      <MessageList
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

/** A row whose ONLY state is local React state (a controlled input) — no external store. When the
 *  virtualizer unmounts this row off-screen, React destroys the state; when it remounts, the input
 *  re-initializes to empty. Keeping the row mounted (via `keepMounted`) is what preserves the typed
 *  value across a scroll-away — the exact PD-119 property. */
function StatefulInputRow({ label }: { readonly label: string }): ReactElement {
  const [value, setValue] = useState("");
  return (
    <div style={{ height: 40 }}>
      <input data-testid="stateful-input" value={value} onChange={(event): void => setValue(event.target.value)} />
      {label}
    </div>
  );
}

/**
 * The PD-119 keep-mounted proof (item-space). Index 0 renders a `StatefulInputRow` holding purely
 * local React state; the list is bottom-anchored over 200 rows, so index 0 sits far outside the
 * overscan window from mount. When `keep` is true, `keepMounted` matches item 0 and forces its index
 * into the rendered range — the row stays mounted off-screen and its typed value survives a
 * scroll-to-tail-and-back. When `keep` is false, the row unmounts on scroll-away and remounts empty
 * (the control case that proves the MECHANISM, not the vibe).
 */
export function KeepMountedStateList({ keep }: { readonly keep: boolean }): ReactElement {
  const items = makeItems(200);
  const firstId = items[0]?.id;
  return (
    <div style={{ height: 200 }}>
      <MessageList
        items={items}
        getItemKey={(item): string => item.id}
        estimateSize={(): number => 40}
        {...(keep ? { keepMounted: (item: FixtureItem): boolean => item.id === firstId } : {})}
        renderItem={(item, index): ReactElement => (index === 0 ? <StatefulInputRow label={item.label} /> : <div style={{ height: 40 }}>{item.label}</div>)}
        className="h-full"
      />
    </div>
  );
}

/** Exposes the imperative handle's `isAtEnd`/`getDistanceFromEnd` readings as two SEPARATE
 *  plain-text nodes (not one combined string — keeps the CT's assertions plain `toHaveText`
 *  equality checks rather than string-parsing) so the CT can read the READING-HISTORY primitives
 *  without reaching into React internals. A "read status" button snapshots the handle's current
 *  values into DOM text. */
export function HandleExposingList({ initialCount, rowHeightPx, listHeightPx }: AppendableListProps): ReactElement {
  const [items] = useState<FixtureItem[]>(() => makeItems(initialCount));
  const handleRef = useRef<MessageListHandle>(null);
  const [isAtEnd, setIsAtEnd] = useState<string>("unread");
  const [distanceFromEnd, setDistanceFromEnd] = useState<string>("unread");
  return (
    <div>
      <button
        type="button"
        data-testid="read-status"
        onClick={(): void => {
          const handle = handleRef.current;
          if (handle === null) {
            setIsAtEnd("no-handle");
            setDistanceFromEnd("no-handle");
            return;
          }
          setIsAtEnd(String(handle.isAtEnd()));
          setDistanceFromEnd(String(Math.round(handle.getDistanceFromEnd())));
        }}
      >
        Read status
      </button>
      <div data-testid="is-at-end">{isAtEnd}</div>
      <div data-testid="distance-from-end">{distanceFromEnd}</div>
      <div style={{ height: listHeightPx }}>
        <MessageList
          ref={handleRef}
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => rowHeightPx}
          renderItem={(item): ReactElement => <div style={{ height: rowHeightPx }}>{item.label}</div>}
          className="h-full"
        />
      </div>
    </div>
  );
}

/**
 * The stick-to-bottom-on-RESIZE shape (the "sending a message strands you ~130px away" regression).
 * The LAST row starts at the row-height ESTIMATE and can grow far taller (the "grow tail" button) —
 * exactly what a just-committed message + a streaming ghost do when they re-measure past their 96px
 * estimate. Pre-fix, `followOnAppend` never re-fires on a size-only change and virtual-core's own
 * resize anchor abandons the pin once one delta clears `scrollEndThreshold`, stranding the reader.
 * The handle readout (mirrors `HandleExposingList`) lets the CT assert the pin held.
 */
export function TailGrowthList({ initialCount, rowHeightPx, listHeightPx }: AppendableListProps): ReactElement {
  const [items, setItems] = useState<FixtureItem[]>(() => makeItems(initialCount));
  const [tailHeightPx, setTailHeightPx] = useState(rowHeightPx);
  const handleRef = useRef<MessageListHandle>(null);
  const [isAtEnd, setIsAtEnd] = useState<string>("unread");
  const [distanceFromEnd, setDistanceFromEnd] = useState<string>("unread");
  const lastIndex = items.length - 1;
  return (
    <div>
      <button type="button" data-testid="grow-tail" onClick={(): void => setTailHeightPx((h) => h + 360)}>
        grow tail
      </button>
      {/* Append a new tall row at the tail — an "arriving message". Grows the container (so the seal's
          ResizeObserver fires) even when the reader has scrolled the old tail off-screen. */}
      <button type="button" data-testid="append-tall" onClick={(): void => setItems((prev) => [...prev, ...makeItems(1, prev.length)])}>
        append tall
      </button>
      <button
        type="button"
        data-testid="read-status"
        onClick={(): void => {
          const handle = handleRef.current;
          if (handle === null) {
            setIsAtEnd("no-handle");
            setDistanceFromEnd("no-handle");
            return;
          }
          setIsAtEnd(String(handle.isAtEnd()));
          setDistanceFromEnd(String(Math.round(handle.getDistanceFromEnd())));
        }}
      >
        Read status
      </button>
      <div data-testid="is-at-end">{isAtEnd}</div>
      <div data-testid="distance-from-end">{distanceFromEnd}</div>
      <div style={{ height: listHeightPx }}>
        <MessageList
          ref={handleRef}
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => rowHeightPx}
          renderItem={(item, index): ReactElement => <div style={{ height: index === lastIndex ? tailHeightPx : rowHeightPx }}>{item.label}</div>}
          className="h-full"
        />
      </div>
    </div>
  );
}

interface PinPromptListProps {
  readonly count: number;
  readonly rowHeightPx: number;
  readonly listHeightPx: number;
  /** The index the "pin" button pins to the viewport top (the just-sent prompt in the real consumer). */
  readonly pinIndex: number;
  /** Defaults to the mode under test; `follow` mounts the SAME fixture to prove pinToIndex is inert there. */
  readonly scrollMode?: MessageListProps<unknown>["scrollMode"];
}

/**
 * The PD-147 `pin-prompt` shape: a "pin" button calls the handle's `pinToIndex(pinIndex)`, scrolling that
 * row to the viewport TOP. Pinning the LAST index exercises the bottom spacer (`paddingEnd`) — without it
 * virtual-core clamps the scroll and a near-end row cannot reach the top.
 */
export function PinPromptList({ count, rowHeightPx, listHeightPx, pinIndex, scrollMode = "pin-prompt" }: PinPromptListProps): ReactElement {
  const [items] = useState<FixtureItem[]>(() => makeItems(count));
  const handleRef = useRef<MessageListHandle>(null);
  return (
    <div>
      <button type="button" data-testid="pin" onClick={(): void => handleRef.current?.pinToIndex(pinIndex)}>
        pin
      </button>
      {/* The "jump to latest" path (PD-147): an explicit scrollToEnd while pinned must abandon the pin
          (clear the spacer) and land on the LAST REAL row, not the trailing spacer void. */}
      <button type="button" data-testid="jump" onClick={(): void => handleRef.current?.scrollToEnd()}>
        jump
      </button>
      <div style={{ height: listHeightPx }}>
        <MessageList
          ref={handleRef}
          scrollMode={scrollMode}
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => rowHeightPx}
          renderItem={(item): ReactElement => <div style={{ height: rowHeightPx }}>{item.label}</div>}
          className="h-full"
        />
      </div>
    </div>
  );
}

/**
 * Proves `useCachedMeasurements`'s exact semantics verified from `virtual-core`'s shipped source
 * (see the prop's own doc in `message-list.tsx`): while frozen, a REAL DOM resize of row 0 is
 * observed by the ResizeObserver but discarded by `measureElement` (which returns the cached size
 * instead) — so the list's total measured height does NOT grow. Once unfrozen, the NEXT real
 * resize is measured for real and the total height jumps to reflect it. Row 0's height is driven
 * by a counter that only ever grows (each "bump" click adds 100px), so every resize is a genuine
 * browser layout change, not a no-op — a stale-effect false positive is not possible here.
 */
export function CachedMeasurementsList(): ReactElement {
  const [frozen, setFrozen] = useState(false);
  const [row0HeightPx, setRow0HeightPx] = useState(40);
  const items = makeItems(5);
  return (
    <div>
      <button type="button" data-testid="toggle-frozen" onClick={(): void => setFrozen((f) => !f)}>
        frozen: {String(frozen)}
      </button>
      <button type="button" data-testid="bump-row0" onClick={(): void => setRow0HeightPx((h) => h + 100)}>
        bump row 0
      </button>
      <div style={{ height: 200 }}>
        <MessageList
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => 40}
          useCachedMeasurements={frozen}
          renderItem={(item, index): ReactElement => <div style={{ height: index === 0 ? row0HeightPx : 40 }}>{item.label}</div>}
          className="h-full"
        />
      </div>
    </div>
  );
}
