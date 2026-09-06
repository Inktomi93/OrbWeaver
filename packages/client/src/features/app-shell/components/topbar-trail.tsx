// TopbarTrailChrome — the `topbar.trail` LENS over the one assembled chrome registry (D73: the rail, the
// topbar and the You sheet are blind lenses over the SAME resolved list). It filters the zone and renders
// each entry in its native trail form; it never sorts (the canonical `(order, id)` algebra has ONE home, in
// `state/assemble-chrome.ts`) and it never looks a modal up (#1789 — the shell used to render a bespoke ⌘K
// chip from its own `useModalRegistry()` lookup, ahead of these widgets, so the zone's contents AND its
// order came from a second place the registry could not answer for).
//
// A PHONE drops the entries curated `mobile: "sheet"` — the You sheet projects them instead. That is the
// topbar BUDGET: at 320px every trail control is 48px of a row whose job is to say where you are (side-eye
// leg-4 P2), and it is the same `MobileCuration` axis the rail has always obeyed.

import type { ReactElement, ReactNode } from "react";
import type { ChromeEntry, ChromeEntryBehavior } from "#state";
import { useChromeRegistry } from "#state";
import { CommandChip } from "./command-chip.tsx";

function assertNever(behavior: never): never {
  throw new Error(`TopbarTrail: unhandled chrome behavior ${JSON.stringify(behavior)}`);
}

/** The zone's render. The registry list is frozen at the door, so calling each entry's `useVisible`
 *  unconditionally, in a fixed loop, is legal (the `contentBySection` precedent). */
export function TopbarTrailChrome({ mobile }: { readonly mobile: boolean }): ReactElement {
  const chrome = useChromeRegistry();
  const entries = chrome.list().filter((e) => e.zone === "topbar.trail" && !(mobile && e.mobile === "sheet"));
  return (
    <>
      {entries.map((entry) => (
        <TrailEntry key={entry.id} entry={entry} />
      ))}
    </>
  );
}

/**
 * ONE trail entry, dispatched over the whole `ChromeEntryBehavior` union — the lens is TOTAL, which is the
 * repair #1789 landed: it used to render `null` for every non-widget entry, so `topbar.trail` could not
 * express a modal trigger at all and the ⌘K chip had to live outside the registry to exist.
 *
 * `false` from `useVisible` ⇒ render NOTHING (no gap — preserves the notification bell's no-flash rule).
 *
 * THE MODAL ARM'S PRESENTATION IS THE ⌘K CHIP, and that is a DECLARED LIMIT worth reading before adding a
 * second trail modal: `topbar.trail` is a REPEATABLE placement (modal-registry-completeness §4), but the
 * chip's copy is the command palette's own — its `⌘K` key cap and the accessible name WCAG 2.5.3 pins
 * verbatim (#188) are not derived from the entry, because there is nothing to derive them from. A second
 * `topbar.trail` modal is the moment that copy becomes trigger DATA; it is not data today because it would
 * be a shape with one producer and no second value to carry.
 *
 * The SECTION arm is unreachable BY TYPE — a section entry's zone is `SectionDefinition.rail.zone`, a
 * `RailZone` (`state/section-registry.ts`), so tsc cannot spell a section outside `rail.*`. It throws
 * rather than returning null: a silent null for a whole behavior arm is exactly the shape that let this
 * zone lose the modal class for a wave.
 */
function TrailEntry({ entry }: { readonly entry: ChromeEntry }): ReactNode {
  const visible = entry.useVisible?.() ?? true;
  if (!visible) {
    return null;
  }
  const behavior: ChromeEntryBehavior = entry.behavior;
  switch (behavior.kind) {
    case "widget":
      return behavior.body("bar");
    case "modal":
      return <CommandChip modalId={behavior.modalId} />;
    case "section":
      throw new Error(`TopbarTrail: chrome entry "${entry.id}" is a section — the trail has no section presentation (a section's zone is a RailZone)`);
    default:
      return assertNever(behavior);
  }
}
