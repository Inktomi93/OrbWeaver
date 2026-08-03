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

/**
 * A custom `filter` override that matches EVERYTHING regardless of the query (the default substring
 * filter would hide non-matches). Defined in this browser-bundled fixture — a `filter` must return
 * synchronously, which a Node-side test closure proxied across the CT boundary cannot do. Proves the
 * async/fuzzy seam (`filter`) forwards through the wrapper to Base UI Root.
 */
export function CustomFilterStory(): ReactElement {
  return <Autocomplete aria-label="Tag" filter={(): boolean => true} items={["adventure", "mystery"]} />;
}

/**
 * The CONTROLLED-OPEN arm: the caller pre-filters (`mode="none"`, so Base UI shows exactly what it is
 * handed) and refuses to open the popup when that list is empty. The popup is an OVERLAY anchored under
 * the field, so an empty one lands on whatever is below — in a prompt dialog, the confirm button, which it
 * then intercepts pointer events for AND removes from the accessibility tree. The button below stands in
 * for that footer.
 */
export function ControlledOpenStory(): ReactElement {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [clicked, setClicked] = useState(0);
  const matches = SOURCE.filter((s) => s.includes(value.trim().toLowerCase()));
  return (
    <div>
      <Autocomplete
        aria-label="Tag"
        items={matches}
        mode="none"
        onOpenChange={setOpen}
        onValueChange={setValue}
        open={open && matches.length > 0}
        value={value}
      />
      <button data-testid="below" onClick={(): void => setClicked((n) => n + 1)} type="button">
        below {clicked}
      </button>
    </div>
  );
}

/**
 * The INLINE arm: the suggestions render IN FLOW under the field instead of in an anchored popup, for a
 * host with no room for an overlay (a prompt dialog). `open` is unconditional per Base UI; an empty
 * `items` is what collapses the list. The button below stands in for the footer a popup used to cover.
 */
export function InlineStory(): ReactElement {
  const [value, setValue] = useState("");
  const [clicked, setClicked] = useState(0);
  const matches = value.trim() === "" ? [] : SOURCE.filter((s) => s.includes(value.trim().toLowerCase()));
  return (
    <div>
      <Autocomplete aria-label="Tag" inline={true} items={matches} mode="none" onValueChange={setValue} open={true} value={value} />
      <button data-testid="below" onClick={(): void => setClicked((n) => n + 1)} type="button">
        below {clicked}
      </button>
    </div>
  );
}
