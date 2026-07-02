// Story wrappers for autocomplete CT (CT mounts from a non-test module). These reproduce the REAL
// consumer shape the shipped API doc claims is unsupported: a parent that re-renders and passes a
// freshly-DERIVED items array (filtered/mapped from state), not a module-const stable reference.
import { Autocomplete } from "@orb/ui/autocomplete";
import type { ReactElement } from "react";
import { useState } from "react";

const SOURCE = ["adventure", "mystery", "romance", "horror", "comedy"];

/**
 * The normal React case: `items` is a NEW array reference on every render, derived during render,
 * while the parent re-renders. If Base UI's filter truly required a "pre-render-stable array" this
 * would show an empty popup after a re-render — the acceptance test asserts it does NOT.
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
      <Autocomplete aria-label="Tag" items={items} />
    </div>
  );
}
