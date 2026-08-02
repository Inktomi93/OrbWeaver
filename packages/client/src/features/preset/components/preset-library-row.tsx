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
// The pressed state paints as the title-line "Active" Badge, not as a rest-visible toggle: LibraryRow floats
// its trailing cluster OUT OF FLOW (so a hidden cluster doesn't spend the 320px pane's title width), and the
// float arm is INERT at rest and sits over the title text — a rest-visible control there is unclickable and
// covers the name (`listRowVariants.float`). So this row takes the chats-row arm of the same D11 invariant:
// the marker carries the state at rest (`ROW_REVEAL_SWAP` — it yields exactly when the cluster reveals), the
// toggle carries the affordance (`rest="never"`), and the row never paints the datum twice.

import type { PresetId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Download, Icon, Lock, Zap } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { LibraryRow, ROW_REVEAL_SWAP, RowToggleAction } from "#components";
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
  // TITLE-LINE markers, not a leading slot: only some rows are Active/built-in, and a leading badge of a
  // different width per row left the title column ragged across the pane (side-eye P2-6).
  const markers: ReactNode =
    active || preset.isSystemDefault ? (
      <>
        {active ? <ActiveMarker /> : null}
        {preset.isSystemDefault ? <Icon icon={Lock} size="sm" /> : null}
      </>
    ) : undefined;

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
      onSelect={(): void => onSelect(preset.id)}
      selected={selected}
      title={preset.name}
      {...(markers === undefined ? {} : { markers })}
      stateToggle={
        <RowToggleAction
          icon={Zap}
          labelOff={activateLabel}
          labelOn={activateLabel}
          onToggle={activate}
          pressed={active}
          pressedClassName="text-primary"
          rest="never"
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

/** The amber ACTIVE marker on the title line — the state half of the activate toggle beside it. It hides
 *  exactly when the cluster reveals (`ROW_REVEAL_SWAP`), so the pressed toggle and this badge never paint
 *  the same datum at once. */
function ActiveMarker(): ReactElement {
  return (
    <Badge className={ROW_REVEAL_SWAP} intent="primary" size="sm">
      Active
    </Badge>
  );
}
