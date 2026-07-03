// CT fixtures for the MediaGrid seal. Playwright CT serializes mount props, so stateful
// callbacks (selection toggling, activation) live HERE as fixture-local state — the tests assert
// the resulting DOM, matching the virtual-list.fixtures.tsx convention.
import type { MediaGridItem, MediaGridKey } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import type { ReactElement, ReactNode } from "react";
import { Component, useState } from "react";

function makeItems(count: number): MediaGridItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `fixture-${index}`,
    thumbUrl: `thumb-${index}.png`,
    alt: `Item ${index}`,
  }));
}

interface BasicGridProps {
  readonly itemCount: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly minCellWidth: number;
}

/** A bounded-parent grid at a fixed pixel width — deterministic column count for assertions. */
export function BasicGrid({
  itemCount,
  widthPx,
  heightPx,
  minCellWidth,
}: BasicGridProps): ReactElement {
  const items = makeItems(itemCount);
  return (
    <div style={{ height: heightPx, width: widthPx }}>
      <MediaGrid
        ariaLabel="Fixture grid"
        className="h-full"
        items={items}
        minCellWidth={minCellWidth}
      />
    </div>
  );
}

/** Two placeholder (no url/thumbUrl) items alongside imaged ones — the reserved-box comparison. */
export function MixedContentGrid({ widthPx }: { readonly widthPx: number }): ReactElement {
  const items: MediaGridItem[] = [
    { id: "with-image", thumbUrl: "thumb-0.png", alt: "Has image" },
    { id: "placeholder", alt: "No image yet" },
  ];
  return (
    <div style={{ height: 300, width: widthPx }}>
      <MediaGrid ariaLabel="Mixed content" className="h-full" items={items} minCellWidth={100} />
    </div>
  );
}

/** One static + one animated item sharing DISTINCT `url`/`thumbUrl` — the src-dispatch assertion. */
export function AnimatedDispatchGrid(): ReactElement {
  const items: MediaGridItem[] = [
    { alt: "Static", id: "static-item", thumbUrl: "thumb-static.png", url: "full-static.png" },
    {
      alt: "Animated",
      animated: true,
      id: "animated-item",
      thumbUrl: "thumb-animated.png",
      url: "full-animated.png",
    },
  ];
  return (
    <div style={{ height: 300, width: 300 }}>
      <MediaGrid
        ariaLabel="Animated dispatch"
        className="h-full"
        items={items}
        minCellWidth={100}
      />
    </div>
  );
}

interface SelectableGridProps {
  readonly itemCount: number;
}

/** Owns its own selection Set — selection mode is "on" whenever `selection` is passed at all. */
export function SelectableGrid({ itemCount }: SelectableGridProps): ReactElement {
  const [selected, setSelected] = useState<ReadonlySet<MediaGridKey>>(new Set());
  const items = makeItems(itemCount);
  return (
    <div style={{ height: 300, width: 300 }}>
      <MediaGrid
        ariaLabel="Selectable grid"
        className="h-full"
        items={items}
        minCellWidth={100}
        selection={{
          onToggle: (id): void => {
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(id)) {
                next.delete(id);
              } else {
                next.add(id);
              }
              return next;
            });
          },
          selectedIds: selected,
        }}
      />
      <p data-testid="selected-count">{selected.size} selected</p>
    </div>
  );
}

/** Plain browse mode — `onActivate` echoes the activated item's alt into a live region. */
export function ActivatableGrid({ itemCount }: SelectableGridProps): ReactElement {
  const [activated, setActivated] = useState<string | null>(null);
  const items = makeItems(itemCount);
  return (
    <div style={{ height: 300, width: 300 }}>
      <MediaGrid
        ariaLabel="Activatable grid"
        className="h-full"
        items={items}
        minCellWidth={100}
        onActivate={(item): void => setActivated(item.alt)}
      />
      <p data-testid="activated">{activated ?? "none"}</p>
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

/** The misuse shape: no bounded parent — the D43 §11.3 tripwire must THROW at mount. */
export function UnboundedGrid({ itemCount }: { readonly itemCount: number }): ReactElement {
  const items = makeItems(itemCount);
  return (
    <TripwireBoundary>
      <div>
        <MediaGrid ariaLabel="Unbounded grid" items={items} minCellWidth={100} />
      </div>
    </TripwireBoundary>
  );
}

const DERIVED_SOURCE: readonly MediaGridItem[] = [
  { alt: "Alpha", id: "a", thumbUrl: "thumb-a.png" },
  { alt: "Bravo", id: "b", thumbUrl: "thumb-b.png" },
  { alt: "Charlie", id: "c", thumbUrl: "thumb-c.png" },
];

/**
 * R7 (ui-primitive-contract, the systemic gap missing from all 3 virtual seals): the parent
 * re-renders passing a freshly-DERIVED (filter+map) items array — not a stable module-const
 * reference (the virtual-list/sortable `DerivedItemsList` precedent).
 */
export function DerivedItemsGrid(): ReactElement {
  const [bump, setBump] = useState(0);
  const items = DERIVED_SOURCE.filter((entry) => entry.alt.length > 0).map((entry) => ({
    ...entry,
  }));
  return (
    <div>
      <button data-testid="rerender" onClick={(): void => setBump((n) => n + 1)} type="button">
        rerender {bump}
      </button>
      <div style={{ height: 300, width: 300 }}>
        <MediaGrid ariaLabel="Derived grid" className="h-full" items={items} minCellWidth={100} />
      </div>
    </div>
  );
}
