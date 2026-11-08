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
import type { OverflowAction } from "#components";
import { OverflowActions, OverflowMenuForms, TRAIL_OVERFLOW_LABEL } from "#components";
import type { OverflowMenuForm } from "#lib";
import type { ActionChromeEntry, ChromeEntry } from "#state";
import { openModal, useChromeRegistry } from "#state";
import { CommandChip } from "./command-chip.tsx";

function assertNever(behavior: never): never {
  throw new Error(`TopbarTrail: unhandled chrome behavior ${JSON.stringify(behavior)}`);
}

/** A `topbar.trail` entry: its widget form must declare a menu form (`TrailWidgetBehavior`). */
type TrailChromeEntry = Extract<ActionChromeEntry, { readonly zone: "topbar.trail" }>;

/** The zone narrows the entry: a section entry's zone is a `RailZone`, so a trail entry is a modal or a widget. */
function isTrailEntry(entry: ChromeEntry): entry is TrailChromeEntry {
  return entry.zone === "topbar.trail";
}

/** The zone's render: one measured row, every entry an action in registry order with its menu form beside its
 *  inline form. The registry list is frozen at the door, so calling each entry's `useVisible` and `useMenuForms`
 *  unconditionally, inside a per-entry component, is legal (the `contentBySection` precedent). */
export function TopbarTrailChrome({ mobile }: { readonly mobile: boolean }): ReactElement {
  const chrome = useChromeRegistry();
  const actions: OverflowAction[] = chrome
    .list()
    .filter(isTrailEntry)
    .filter((e) => !(mobile && e.mobile === "sheet"))
    .map((entry) => ({ id: entry.id, inline: <TrailEntry entry={entry} />, menu: <TrailMenuEntry entry={entry} />, primary: entry.primary === true }));
  return <OverflowActions actions={actions} topbarTrail={true} gap="field" label={TRAIL_OVERFLOW_LABEL} slot="overflow-actions" />;
}

function WidgetMenuForms({ useMenuForms }: { readonly useMenuForms: () => readonly OverflowMenuForm[] }): ReactElement {
  return <OverflowMenuForms forms={useMenuForms()} />;
}

/** The entry's menu form, shown when the row has no room for its inline form. `false` from `useVisible` ⇒ nothing. */
function TrailMenuEntry({ entry }: { readonly entry: TrailChromeEntry }): ReactNode {
  const visible = entry.useVisible?.() ?? true;
  if (!visible) {
    return null;
  }
  const behavior = entry.behavior;
  switch (behavior.kind) {
    case "widget":
      return <WidgetMenuForms useMenuForms={behavior.useMenuForms} />;
    case "modal":
      return <OverflowMenuForms forms={[{ id: entry.id, label: entry.label, icon: behavior.icon, onSelect: (): void => openModal(behavior.modalId) }]} />;
    default:
      return assertNever(behavior);
  }
}

/**
 * ONE trail entry, dispatched over the whole `ChromeEntryBehavior` union — the lens is TOTAL, which is the
 * repair #1789 landed: it used to render `null` for every non-widget entry, so `topbar.trail` could not
 * express a modal trigger at all and the ⌘K chip had to live outside the registry to exist.
 *
 * `false` from `useVisible` ⇒ render NOTHING (no gap — preserves the notification bell's no-flash rule).
 *
 * THE MODAL ARM'S PRESENTATION IS THE ⌘K CHIP, and that is a DECLARED LIMIT worth reading before adding a
 * second trail modal: `topbar.trail` is a REPEATABLE placement (only `mobile-tab` is a singleton). The glyph
 * and the tooltip label come from the entry, but the accessible name and the shortcut hint are the command
 * palette's own. A second `topbar.trail` modal is the moment that copy becomes trigger DATA; it is not data
 * today because it would be a shape with one producer and no second value to carry.
 *
 * There is no SECTION arm: `ActionChromeEntry` excludes it by type, because a section entry's zone is a
 * `RailZone` (`state/chrome-registry.ts`).
 */
function TrailEntry({ entry }: { readonly entry: TrailChromeEntry }): ReactNode {
  const visible = entry.useVisible?.() ?? true;
  if (!visible) {
    return null;
  }
  const behavior = entry.behavior;
  switch (behavior.kind) {
    case "widget":
      return behavior.body("bar");
    case "modal":
      return <CommandChip icon={behavior.icon} label={entry.label} modalId={behavior.modalId} />;
    default:
      return assertNever(behavior);
  }
}
