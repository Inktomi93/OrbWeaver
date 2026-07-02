// CT fixtures for the sortable seal. Playwright CT serializes mount props, so the stateful
// controlled-reorder wiring (onReorder → setItems) lives HERE; the tests pass only numbers/booleans.
import { SortableList } from "@orb/ui/sortable";
import type { ReactElement } from "react";
import { useState } from "react";

interface FixtureItem {
  readonly id: string;
  readonly label: string;
}

function makeItems(count: number): FixtureItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    label: `Item ${index}`,
  }));
}

interface ReorderableListProps {
  readonly itemCount?: number;
  readonly handle?: boolean;
  readonly disabled?: boolean;
}

/**
 * A controlled reorder story: `onReorder` maps the reported key order back onto `items`. Also
 * surfaces the call count + last payload as plain text nodes — CT mount props are serialized, so a
 * closure spy can't be read back from the test; the DOM is the only channel.
 */
export function ReorderableList({
  itemCount = 3,
  handle = false,
  disabled = false,
}: ReorderableListProps): ReactElement {
  const [items, setItems] = useState<FixtureItem[]>(() => makeItems(itemCount));
  const [reorderCount, setReorderCount] = useState(0);
  const [lastOrder, setLastOrder] = useState("");

  return (
    <div>
      <p data-testid="reorder-count">{reorderCount}</p>
      <p data-testid="last-order">{lastOrder}</p>
      <SortableList
        disabled={disabled}
        getItemKey={(item): string => item.id}
        handle={handle}
        items={items}
        onReorder={(orderedKeys): void => {
          const byKey = new Map(items.map((item) => [item.id, item]));
          const next = orderedKeys.map((key) => {
            const found = byKey.get(String(key));
            if (found === undefined) {
              throw new Error(`ReorderableList fixture: unknown key ${String(key)}`);
            }
            return found;
          });
          setItems(next);
          setReorderCount((n) => n + 1);
          setLastOrder(orderedKeys.join(","));
        }}
        renderItem={(item): ReactElement => <div>{item.label}</div>}
      />
    </div>
  );
}

const DERIVED_SOURCE: readonly FixtureItem[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
];

/**
 * R7 (ui-package-design §13): the parent re-renders passing a freshly-DERIVED (filter+map) items
 * array — not a stable module-const reference — proving the seal doesn't secretly depend on item
 * array identity surviving a render.
 */
export function DerivedItemsList(): ReactElement {
  const [order, setOrder] = useState<string[]>(["a", "b", "c"]);
  const [bump, setBump] = useState(0);
  const items = order
    .map((id) => DERIVED_SOURCE.find((entry) => entry.id === id))
    .filter((entry): entry is FixtureItem => entry !== undefined);

  return (
    <div>
      <button data-testid="rerender" onClick={(): void => setBump((n) => n + 1)} type="button">
        rerender {bump}
      </button>
      <SortableList
        getItemKey={(item): string => item.id}
        items={items}
        onReorder={(orderedKeys): void => setOrder(orderedKeys.map(String))}
        renderItem={(item): ReactElement => <div>{item.label}</div>}
      />
    </div>
  );
}
