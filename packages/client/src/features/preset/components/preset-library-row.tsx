// One preset row in the Presets LIST — a shared `LibraryRow` (§13.2 entity row → RowActionsMenu). Clicking
// it opens the preset in the editor. The subtitle is the row's scent (`presetRowSubtitle` — the edit stamp
// plus a meaningful kind plus the fork lineage the surface resolved), since same-base forks all carry the
// SAME name. The system-default row is marked (editing it COWs into a fork server-side), keeps its
// "Built-in default" subtitle, and cannot be deleted. The Duplicate/Delete menu + its delete-confirm live
// in LibraryRow; the delete copy warns when the row is the active preset. RENAME IS NOT ON THIS ROW — it
// single-homes in the editor header (#506/#442/#483; the reasoning sits at the omission below).
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
// and the affordance — and the pressed dot NEVER hides. Its accessible radio state names the active pick
// without spending the title's reading space on a duplicate status label.
//
// ACTIVATE HAS ONE HOME ON THIS ROW: the radio (side-eye 2026-08-22 P2-6, issue #481). Both kebabs used to
// carry an `Activate` menuitem — the ordinary row's and the built-in's — sitting 40px from the radio that
// does the same thing. THE RULING SURVIVES; ITS INPUT CHANGED: the echo was minted as "§16 row 3 echo (a):
// the kebab mirrors the inline toggle for KEYBOARD/discoverability parity", and the keyboard half of that
// premise is now served properly by the radio itself — `use-roving-radio-group` gives the group Arrow/Home/
// End navigation with a Space/Enter commit, so the menuitem is no longer anyone's only keyboard door. What
// remains is duplication, and `preset-editor-surface.tsx:362-365` already ruled the same shape for Export:
// "ONE home — the list-row kebab, matching the characters/chats precedent". The same test kills this echo.
// The two doors that survive are the row radio (list-side commitment) and the editor header's Activate.

import type { VersionedParseFailure } from "@orb/contracts/versioned-config";
import type { PresetId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { AlertTriangle, Circle, Download, Icon, Lock } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { LibraryRow, RowToggleAction } from "#components";
import { PRESET_UNREADABLE_ROW_MARKER, timeLib, unreadableConfigCause } from "#lib";
import { presetRowSubtitle } from "../lib/preset-row-view.ts";

/** How many §12.2 cluster slots THIS list reserves on every row — the state dot + the kebab, which is now
 *  EVERY row's cluster (the built-in carries both too), so the dot column lands at one x with no spacer.
 *
 *  IT WAS THREE (side-eye 2026-08-19 P1-1). The third slot was the inline Duplicate, and the reservation is
 *  spent on EVERY row ALWAYS (the file header's own "the cost is honest" note): measured at the docked 272px
 *  pane it left the NAME 109px and clipped four of six rows — while the verb it reserved for is a verbatim
 *  copy of the kebab's own Duplicate item, i.e. 40px of permanent width bought a second door to one act. The
 *  regex list settled the same trade the same way (`library-row.tsx` — a 1-verb list stopped reserving
 *  three). The kebab's item is the ONE home now; nothing about the fork workflow got harder, it moved one
 *  click into the menu that already offered it. */
const PRESET_CLUSTER_SLOTS = 2;

/** The minimal preset shape the row renders (a `PresetSummary` — tRPC-inferred at the surface). */
interface PresetRowItem {
  readonly id: PresetId;
  readonly name: string;
  readonly kind: string;
  readonly isSystemDefault: boolean;
  readonly configUnreadable: VersionedParseFailure | null;
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
  /** Make THIS row the active-for-generation pick (§16 row 3 — the one `setDefault` mutation). */
  readonly onActivate: (id: PresetId) => void;
  /** Download this preset as an `orb.preset` file (G6). Never offered on the built-in row. */
  readonly onExport: (id: PresetId) => void;
}

/** A single preset library row (its Duplicate/Delete menu + delete-confirm come from LibraryRow). */
export function PresetLibraryRow({
  preset,
  selected,
  active,
  qualifier,
  forkedFromName,
  onSelect,
  onDelete,
  onDuplicate,
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
      // The LIST's widest cluster is TWO (state dot · kebab) and every row now renders both, so the dot
      // column holds one x with no spacer at all.
      actionsReserved={PRESET_CLUSTER_SLOTS}
      onSelect={(): void => onSelect(preset.id)}
      selected={selected}
      title={preset.name}
      subtitleStep="label"
      // Item 17: the lock is a property of the NAME (the mock draws it inline-left of "Default"), not an
      // action slot at the row's far end — where it collided with the revealed cluster (item 19). It costs
      // the built-in row's title its shared x with the other rows; that is the mock's own drawing, and it
      // supersedes side-eye P2-6's "no leading slot" for this one glyph (P2-6's harm was a VARIABLE-width
      // status badge on many rows; this is a fixed glyph on exactly one).
      {...(preset.isSystemDefault ? { leading: <Icon icon={Lock} size="sm" /> } : {})}
      // The editor's notice explains an unreadable blob; the list says so first, so a re-imported twin
      // that landed beside it (ADR 0290) is not mistaken for the broken row.
      {...(preset.configUnreadable === null
        ? {}
        : {
            subtitleLead: (
              <Badge className="mr-field" intent="warning" size="inline" tone="soft">
                <Icon icon={AlertTriangle} size="xs" />
                {PRESET_UNREADABLE_ROW_MARKER[unreadableConfigCause(preset.configUnreadable)]}
              </Badge>
            ),
          })}
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
          // `when-on`, the D11 default: the PRESSED dot is permanently visible and only the unpressed ring
          // rides the reveal. It must never be `never`/`hidden` — that swap is the P0 loop.
          rest="when-on"
          // ONE-OF-N, not a toggle (side-eye F-19 / ARIA rec 3): pressing the active row is a NO-OP, so
          // `aria-pressed`'s "press to release" contract was a promise this control refuses to keep.
          semantics="radio"
        />
      }
      {...(preset.isSystemDefault
        ? {
            subtitle: "Built-in default",
            // THE BUILT-IN IS DUPLICABLE (side-eye 2026-08-19 P3). It was the one preset in the library you
            // could not copy: `actions` was withheld whole because the row is un-renameable and un-deletable,
            // so the Duplicate that has nothing to do with either went with them. The only copy path was
            // "edit something and the server forks it for you" — a copy you cannot ask for by name, and the
            // starting point every fork workflow actually wants. The menu carries what the row OFFERS and
            // nothing it would refuse: Duplicate, never Rename, Delete or Export — and no Activate either
            // (#481: activation's one list-side home is the row's radio, see the file header).
            actions: {
              name: preset.name,
              qualifier,
              onDuplicate: (): void => onDuplicate(preset.id),
            },
          }
        : {
            // F5: the row's scent — forks of the same base share a name, so the edit stamp (+ a
            // meaningful kind, + the fork lineage when the source is known) tells the rows apart.
            // THE STAMP FORM IS COMPACT IN A DENSE LIST (#99 item 4). The chats list settled this already
            // (`chat-summary-row.tsx`: "in a list this is a column the eye scans, and the long form ate ~7
            // characters of the title's width on every row"), and a preset row is the same shape — four of
            // them stacked in a 296px rail, each spending a clause on "about two hours ago" where "2h"
            // says it. `presetRowSubtitle` takes the formatter, so this is a call-site decision, not a
            // second derivation.
            subtitle: presetRowSubtitle({ kind: preset.kind, updatedAt: preset.updatedAt, forkedFromName }, timeLib.formatRelativeCompact),
            actions: {
              // §12.2 per-list assignment: this list declares NO inline verb. Duplicate is the frequent verb
              // and it lives in the kebab ONLY — see PRESET_CLUSTER_SLOTS for the measurement that killed the
              // inline twin (it was a verbatim second door whose reserved width starved the name on every row).
              name: preset.name,
              // Nine forks share the name "Default (edited)" — the edit stamp the subtitle already shows is
              // what tells their ACTION names apart too (side-eye P3a), escalated by the SURFACE where the
              // stamp collided as well (P2c).
              qualifier,
              // NO `onRename` — RENAME SINGLE-HOMES IN THE EDITOR (#506, on #442's ruling for the same
              // verb on world-info: "rename single-homes in the EDITOR", the posture tags and regex
              // already ship). #483 built the editor door (`preset-editor-header.tsx`, the Pencil beside
              // the h2) and argued it AT that site: `New` mints "New preset" and opens the editor, so the
              // only naming door used to be the OTHER pane's kebab — a control far from where its effect
              // shows, on the very first thing a new user does, and on mobile the LIST is a closed sheet
              // so from the editor the name could not be changed at all. That door is the one home now;
              // this item was the second, and `LibraryRowActions.onRename` is optional for exactly this
              // (the regex list minted the omission). Nothing else about this row changes: Duplicate,
              // Delete and Export are lifecycle and stay list-side (O-16★).
              onDuplicate: (): void => onDuplicate(preset.id),
              onDelete: (): void => onDelete(preset.id),
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
