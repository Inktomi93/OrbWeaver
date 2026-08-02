// One preset row in the Presets LIST — a shared `LibraryRow` (§13.2 entity row → RowActionsMenu). Clicking
// it opens the preset in the editor. The subtitle is the row's scent (`presetRowSubtitle` — the edit stamp
// plus a meaningful kind plus the fork lineage the surface resolved), since same-base forks all carry the
// SAME name. The system-default row is marked (editing it COWs into a fork server-side), keeps its
// "Built-in default" subtitle, and cannot be deleted. The Rename/Duplicate/Delete menu + its delete-confirm
// live in LibraryRow; the delete copy warns when the row is the active preset.
//
// ACTIVATE (redesign §9, owner decision D1) is the row's STATE TOGGLE — the one-of-N pick of the preset the
// next generation runs with, amending §12.2's "presets carry no boolean row state". It is RADIO-shaped: the
// press activates THIS row (which unpresses whichever row held it), and pressing the already-active row is a
// no-op — deactivation is activating another row, never a bare unpress, because "no preset at all" is not a
// state the funnel has. The BUILT-IN row carries the same toggle and IS the null pick (`defaultPresetId ===
// null`), so it activates through the same one mutation as every other row.
//
// THE TRAILING SLOT IS ONE RESERVED, FIXED-GEOMETRY REGION (owner ruling O-1 + the P0 root cause,
// 2026-08-02) — `actionsReserved`, so the cluster stays IN FLOW and the row's layout is identical at rest
// and on hover. Three defects died with the old shape:
//   · the P0 HOVER LOOP — the pressed state used to paint as a title-line "Active" Badge that
//     `display:none`d itself on hover (`ROW_REVEAL_SWAP`). That reflowed the title line UNDER a stationary
//     pointer, so the hover boundary slid across the cursor and the row re-hit-tested at frame rate
//     (~85 crossings/sec measured, zero DOM mutations). Nothing on this row enters or leaves layout now:
//     the toggle is permanently mounted and reveal is opacity-only.
//   · the DOUBLE HIGHLIGHT (item 18) — the floated cluster painted its own `bg-accent` panel on top of the
//     row's hover tint. In flow it has no backdrop; the glyphs ride the row's own tint.
//   · the BUILT-IN COLLISION (item 19) — the lock marker and the revealed toggle both wanted the row's
//     trailing end and stacked on top of each other. The lock is now inline-LEFT of the name (item 17: it
//     is a property of the NAME, per the list mock), and the trailing region holds controls only.
// The cost is honest and was the mock's own call: the strip's width is spent on every row, always.
//
// STATE IS THE TOGGLE (O-1): pressed = a FILLED lucide dot (the seal's `fill` axis on the `Circle`
// FillableIcon), unpressed = a hollow ring that reveals with the row. One element carries both the datum
// and the affordance, so the row cannot paint the state twice — and the pressed dot NEVER hides.

import type { PresetId } from "@orb/kit/ids";
import { Circle, Download, Icon, Lock, Zap } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { LibraryRow, RowToggleAction } from "#components";
import { timeLib } from "#lib";
import { presetRowSubtitle } from "../lib/preset-row-view";

/** The minimal preset shape the row renders (a `PresetSummary` — tRPC-inferred at the surface). */
interface PresetRowItem {
  readonly id: PresetId;
  readonly name: string;
  readonly kind: string;
  readonly isSystemDefault: boolean;
  readonly updatedAt: number;
}

export interface PresetLibraryRowProps {
  readonly preset: PresetRowItem;
  readonly selected: boolean;
  /** The row's fork SOURCE name, resolved by the surface from `preset.forkedFrom` across the whole list —
   *  null when the row is not a fork or its source is not a row the client can see (a packaged template). */
  readonly forkedFromName: string | null;
  /** The row's action-name DISAMBIGUATOR, resolved by the surface across the whole list (`rowQualifiers`) —
   *  the edit stamp this row shows, escalated where forks collided on it too (side-eye P2c). */
  readonly qualifier: string;
  /** The row is the ACTIVE-for-generation preset (the built-in row ⇔ `defaultPresetId === null`). */
  readonly active: boolean;
  readonly onSelect: (id: PresetId) => void;
  readonly onDelete: (id: PresetId) => void;
  readonly onDuplicate: (id: PresetId) => void;
  readonly onRename: (id: PresetId) => void;
  /** Make THIS row the active-for-generation pick (§16 row 3 — the one `setDefault` mutation). */
  readonly onActivate: (id: PresetId) => void;
  /** Download this preset as an `orb.preset` file (G6). Never offered on the built-in row. */
  readonly onExport: (id: PresetId) => void;
}

/** A single preset library row (its Rename/Duplicate/Delete menu + delete-confirm come from LibraryRow). */
export function PresetLibraryRow({
  preset,
  selected,
  active,
  qualifier,
  forkedFromName,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
  onActivate,
  onExport,
}: PresetLibraryRowProps): ReactElement {
  // ONE label in both states: the press only ever ACTIVATES, so a pressed-state name that promised an
  // un-activate would describe an action this control does not have. `aria-pressed` carries the state.
  const activateLabel = `Activate ${preset.name} for generation`;
  const activate = (): void => {
    if (!active) {
      onActivate(preset.id);
    }
  };

  return (
    <LibraryRow
      // The cluster carries a rest-visible control (the pressed dot), so the strip is reserved in flow —
      // see the file header.
      actionsReserved={true}
      onSelect={(): void => onSelect(preset.id)}
      selected={selected}
      title={preset.name}
      // Item 17: the lock is a property of the NAME (the mock draws it inline-left of "Default"), not an
      // action slot at the row's far end — where it collided with the revealed cluster (item 19). It costs
      // the built-in row's title its shared x with the other rows; that is the mock's own drawing, and it
      // supersedes side-eye P2-6's "no leading slot" for this one glyph (P2-6's harm was a VARIABLE-width
      // status badge on many rows; this is a fixed glyph on exactly one).
      {...(preset.isSystemDefault ? { leading: <Icon icon={Lock} size="sm" /> } : {})}
      stateToggle={
        <RowToggleAction
          // The dot, not the bolt (owner ruling O-1): a ⚡ reads as a one-shot zap ACTION and had no visible
          // relationship to the state it sets. `Circle` fills to a solid disc — the mock's exact grammar,
          // hollow ring at rest, filled amber disc when this row is the pick.
          icon={Circle}
          labelOff={activateLabel}
          labelOn={activateLabel}
          onToggle={activate}
          pressed={active}
          pressedClassName="text-primary"
          // A FILLED disc vs a hollow ring — a shape delta, not stroke color alone (side-eye F-06, WCAG
          // 1.4.1).
          pressedFill={true}
          // `when-on`, the D11 default: the PRESSED dot is permanently visible (it is the row's whole state
          // readout now that the Active badge is gone) and only the unpressed ring rides the reveal. It must
          // never be `never`/`hidden` — that swap is the P0 loop.
          rest="when-on"
          // ONE-OF-N, not a toggle (side-eye F-19 / ARIA rec 3): pressing the active row is a NO-OP, so
          // `aria-pressed`'s "press to release" contract was a promise this control refuses to keep.
          semantics="radio"
        />
      }
      {...(preset.isSystemDefault
        ? { subtitle: "Built-in default" }
        : {
            // F5: the row's scent — forks of the same base share a name, so the edit stamp (+ a
            // meaningful kind, + the fork lineage when the source is known) tells the rows apart.
            subtitle: presetRowSubtitle(preset.kind, preset.updatedAt, timeLib.formatRelative, forkedFromName),
            actions: {
              // §12.2 per-list assignment: DUPLICATE is the measured frequent verb (the fork workflow —
              // nine "Default (edited)" rows are its receipt), so it is the row's ONE inline verb beside the
              // state toggle. The kebab keeps its own Duplicate item (mirror parity).
              inlineVerb: "duplicate",
              name: preset.name,
              // Nine forks share the name "Default (edited)" — the edit stamp the subtitle already shows is
              // what tells their ACTION names apart too (side-eye P3a), escalated by the SURFACE where the
              // stamp collided as well (P2c).
              qualifier,
              onRename: (): void => onRename(preset.id),
              onDuplicate: (): void => onDuplicate(preset.id),
              onDelete: (): void => onDelete(preset.id),
              // §16 row 3 echo (a): the kebab mirrors the inline toggle for keyboard/discoverability parity,
              // through the SAME activate call. Already-active ⇒ the item is absent, not disabled: the menu
              // offers no act it would refuse.
              ...(active
                ? {}
                : {
                    menuItemsBefore: (
                      <MenuItem onClick={activate}>
                        <Icon icon={Zap} size="sm" />
                        Activate
                      </MenuItem>
                    ),
                  }),
              // G6: the single-preset export door. Its bytes are `buildPresetFile`'s — the same serde the
              // whole-profile bundle writes (the surface owns the download; this is just its home).
              menuItemsAfter: (
                <MenuItem onClick={(): void => onExport(preset.id)}>
                  <Icon icon={Download} size="sm" />
                  Export
                </MenuItem>
              ),
              deleteDescription: active
                ? "This is your active preset for generation. Deleting it clears the active pick — new chats fall back to the built-in default. This can't be undone."
                : "This permanently removes the preset. This can't be undone.",
            },
          })}
    />
  );
}
