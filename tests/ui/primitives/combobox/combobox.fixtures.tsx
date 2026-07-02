// Story wrappers for combobox CT (CT mounts from a non-test module). Mirrors the autocomplete
// seal's fixture: a parent that re-renders and passes a freshly-DERIVED items array (filtered/
// mapped from state during render), the real consumer shape, not a module-const stable reference.
import { Combobox } from "@orb/ui/combobox";
import type { ReactElement } from "react";
import { useState } from "react";

const SOURCE = ["adventure", "mystery", "romance", "horror", "comedy"];

/**
 * `items` is a NEW array reference on every render, derived during render, while the parent
 * re-renders AND the chip selection changes. Proves the filter + the chip commit both stay correct
 * across a parent re-render passing a fresh reference (R7's acceptance shape).
 */
export function DerivedItemsStory(): ReactElement {
  const [bump, setBump] = useState(0);
  const rerender = (): void => setBump((n) => n + 1);
  // fresh array, derived during render (filter+map) — a different reference each render.
  const items = SOURCE.filter((s) => s.length > 0).map((s) => s.toLowerCase());
  return (
    <div>
      <button type="button" onClick={rerender} data-testid="rerender">
        rerender {bump}
      </button>
      <Combobox aria-label="Tag" items={items} />
    </div>
  );
}
